import axios, { AxiosResponse } from 'axios';
import { BzzNode as Bzz } from '@erebos/bzz-node';
import * as fs from 'fs';
import * as path from 'path';


export interface Imported {
    content: string;
}

interface PreviouslyHandledImports {
    [filePath: string]: Imported
}

interface Handler {
    type: string;
    match(url: string): any;
    handle(type: string, match: any): any;
}

export class ImportResolver {

    private previouslyHandled: PreviouslyHandledImports;
    private depsCachePath: string;

    constructor(cachePath: string) {
        this.previouslyHandled = {};
        this.depsCachePath = path.join(cachePath, ".deps");
    }

    public async resolve(importPath: string): Promise<Imported | undefined> {
        let imported: Imported = this.previouslyHandled[importPath];
        if (imported) {
            return imported;
        }
        const handlers: Handler[] = this.getHandlers();
        for (const handler of handlers) {
            const match = handler.match(importPath);
            if (match) {
                const res: Imported | undefined = await handler.handle(handler.type, match);
                if (res !== undefined) {
                    this.previouslyHandled[importPath] = res;
                }
                return res;
            }
        }
    }

    private async getDepsCache(type: string, destFile: string): Promise<string | undefined> {
        const cachefile = path.join(this.depsCachePath, type, destFile);
        if (fs.existsSync(cachefile)) {
            return await fs.promises.readFile(cachefile, 'utf8');
        }
    }

    private async saveDepsCache(type: string, destFile: string, content: string) {
        const cachefile = path.join(this.depsCachePath, type, destFile);
        await fs.promises.mkdir(path.dirname(cachefile), { recursive: true });
        fs.writeFile(cachefile, content, err => {
            if (err !== undefined) {
                console.error(err);
            }
        });
    }

    /**
    * Handle an import statement based on fs
    * @param filePath path of the file in local
    */
    private async handleLocal(filePath: string): Promise<Imported | undefined> {
        if (fs.existsSync(filePath)) {
            return { content: await fs.promises.readFile(filePath, 'utf8') };
        }
    }

    /**
    * Handle an import statement based on github
    * @param root The root of the github import statement
    * @param filePath path of the file in github
    */
    private async handleGithub(type: string, root: string, filePath: string): Promise<Imported | undefined> {
        const regex = filePath.match(/blob\/([^/]+)\/(.*)/);
        let reference = 'master';
        if (regex) {
            // if we have /blob/master/+path we extract the branch name "master" and add it as a parameter to the github api
            // the ref can be branch name, tag, commit id
            reference = regex[1];
            filePath = filePath.replace(`blob/${reference}/`, '');
        }
        const cacheFilePath = root + '/' + filePath;
        const content = await this.getDepsCache(type, cacheFilePath);
        if (content !== undefined) {
            return { content };
        }

        try {
            const req = `https://raw.githubusercontent.com/${root}/${reference}/${filePath}`;
            const response: AxiosResponse = await axios.get(req, { transformResponse: [] });
            const imported = { content: response.data };
            await this.saveDepsCache(type, cacheFilePath, imported.content);
            return imported;
        } catch (e) {
            console.error(e);
        }
    }

    /**
    * Handle an import statement based on http
    * @param url The url of the import statement
    * @param cleanUrl
    */
    private async handleHttp(type: string, url: string, cacheFilePath: string): Promise<Imported | undefined> {
        const content = await this.getDepsCache(type, cacheFilePath);
        if (content !== undefined) {
            return { content };
        }
        try {
            const response: AxiosResponse = await axios.get(url, { transformResponse: [] });
            const imported = { content: response.data };
            await this.saveDepsCache(type, cacheFilePath, imported.content);
            return imported;
        } catch (e) {
            console.error(e);
        }
    }

    private async handleSwarm(type: string, cleanUrl: string): Promise<Imported | undefined> {
        const cacheFilePath = cleanUrl;
        const content = await this.getDepsCache(type, cacheFilePath);
        if (content !== undefined) {
            return { content };
        }
        try {
            const bzz = new Bzz({ url: 'http://swarm-gateways.net' });
            const url = bzz.getDownloadURL(cleanUrl, { mode: 'raw' });
            const response: AxiosResponse = await axios.get(url, { transformResponse: [] });
            const imported = { content: response.data };
            await this.saveDepsCache(type, cacheFilePath, imported.content);
            return imported;
        } catch (e) {
            console.error(e);
        }
    }

    /**
    * Handle an import statement based on IPFS
    * @param url The url of the IPFS import statement
    */
    private async handleIPFS(type: string, url: string): Promise<Imported | undefined> {
        // replace ipfs:// with /ipfs/
        url = url.replace(/^ipfs:\/\/?/, 'ipfs/');

        const cacheFilePath = url.replace('ipfs/', '');
        const content = await this.getDepsCache(type, cacheFilePath);
        if (content !== undefined) {
            return { content };
        }

        try {
            const req = 'https://ipfs.remixproject.org/' + url;
            const response: AxiosResponse = await axios.get(req, { transformResponse: [] });
            const imported = { content: response.data };
            await this.saveDepsCache(type, cacheFilePath, imported.content);
            return imported;
        } catch (e) {
            console.error(e);
        }
    }

    /**
    * Handle an import statement based on NPM
    * @param url The url of the NPM import statement
    */
    private async handleNPM(type: string, url: string): Promise<Imported | undefined> {
        const cacheFilePath = url;
        const content = await this.getDepsCache(type, cacheFilePath);
        if (content !== undefined) {
            return { content };
        }
        try {
            const req = 'https://unpkg.com/' + url;
            const response: AxiosResponse = await axios.get(req, { transformResponse: [] });
            const imported = { content: response.data };
            await this.saveDepsCache(type, cacheFilePath, imported.content);
            return imported;
        } catch (e) {
            console.error(e);
        }
    }

    private getHandlers(): Handler[] {
        return [
            {
                type: 'local',
                match: (url) => { return /^\/.*/.exec(url); },
                handle: (type, match) => this.handleLocal(match[0])
            },
            {
                type: 'github',
                match: (url) => { return /^(https?:\/\/)?(www.)?github.com\/([^/]*\/[^/]*)\/(.*)/.exec(url); },
                handle: (type, match) => this.handleGithub(type, match[3], match[4])
            },
            {
                type: 'http+s',
                match: (url) => { return /^(http[s]{0,1}?:\/\/?(.*))$/.exec(url); },
                handle: (type, match) => this.handleHttp(type, match[1], match[2])
            },
            {
                type: 'swarm',
                match: (url) => { return /^(bzz-raw?:\/\/?(.*))$/.exec(url); },
                handle: (type, match) => this.handleSwarm(type, match[2])
            },
            {
                type: 'ipfs',
                match: (url) => { return /^(ipfs:\/\/?.+)/.exec(url); },
                handle: (type, match) => this.handleIPFS(type, match[1])
            },
            {
                type: 'npm',
                match: (url) => { return /^[^/][^\n"?:*<>|]*$/g.exec(url); }, // match a typical relative path
                handle: (type, match) => this.handleNPM(type, match[0])
            }
        ];
    }
}