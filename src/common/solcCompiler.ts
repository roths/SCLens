import * as fs from 'fs';
import * as https from 'https';
import * as solc from 'solc';
import * as path from 'path';
import * as vscode from 'vscode';
import { CompilationResult, Source, CompilationError } from './type';
import { ImportResolver } from './importResolver';
import * as semver from 'semver';

interface SolcVersionMap {
    // 0.8.15: "soljson-v0.8.15+commit.e14f2714.js"
    [version: string]: string;
}
export class SolcCompiler {

    private cachePath: string;
    private compiler: any;
    private selectedCompilerVersion: string = 'recommend';
    usedCompilerVersion: string = '';
    private resolver: ImportResolver;
    private solcVersionMap?: SolcVersionMap;

    constructor(cachePath: string) {
        this.cachePath = cachePath;
        this.resolver = new ImportResolver(cachePath);
    }

    public switchVersion(newVersion: string) {
        this.selectedCompilerVersion = newVersion;
    }

    public async compile(contractPath: string) {
        const settings = {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            outputSelection: {
                '*': {
                    '': ['ast'],
                    '*': ['abi', 'devdoc', 'userdoc', 'storageLayout', 'metadata', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'evm.gasEstimates'],
                },
            }
        };

        const code = await fs.promises.readFile(contractPath, 'utf8');
        const sources: Source = {};
        sources[contractPath] = { content: code };

        return this.execSolc(sources, settings);
    }

    public async diagnostic(contractPath: string) {
        const settings = {
            optimizer: {
                enabled: false,
                runs: 0,
            },
            outputSelection: {
                '*': {
                    '': [],
                    '*': [],
                },
            }
        };

        const code = await fs.promises.readFile(contractPath, 'utf8');
        const sources: Source = {};
        sources[contractPath] = { content: code };

        return this.execSolc(sources, settings);
    }

    private async execSolc(sources: Source, settings: any): Promise<CompilationResult> {
        let compilerVersion: string | null = this.selectedCompilerVersion;
        if (compilerVersion === "recommend") {
            compilerVersion = await this.getRecommendVersion(sources);
        }
        if (compilerVersion === null) {
            return {
                errors: [{
                    formattedMessage: 'Can not find a match Solidity compile version:\n' + this.formatCompilerVersionErrorMsg(sources),
                    severity: 'error', mode: 'panic'
                }]
            };
        }
        await this.prepareCompiler(compilerVersion);

        const compilation = {
            language: 'Solidity',
            sources: sources,
            settings: settings
        };

        const missingImports: string[] = [];
        const missingImportsCallback = (importPath: string) => {
            missingImports.push(importPath);
            return { error: 'Deferred import' };
        };

        let result: CompilationResult = {};

        try {
            result = JSON.parse(this.compiler.compile(JSON.stringify(compilation), { import: missingImportsCallback }));

            let hasFatalErrors = false; // ie warnings are ok

            const checkIfFatalError = (error: CompilationError) => {
                const isValidError = (error.message && error.message.includes('Deferred import')) ? false : error.severity !== 'warning';
                if (isValidError) {
                    hasFatalErrors = true;
                }
            };
            if (result.errors) {
                result.errors.forEach((err) => checkIfFatalError(err));
            }

            if (!hasFatalErrors && missingImports.length > 0) {
                const failureImport = await this.resolveImport(sources, missingImports);
                if (failureImport.length === 0) {
                    return this.execSolc(sources, settings);
                } else {
                    return { errors: [{ formattedMessage: 'Fail to resolve import:\n' + JSON.stringify(failureImport), severity: 'error', mode: 'panic' }] };
                }
            }
        } catch (exception) {
            result = { errors: [{ formattedMessage: 'Uncaught JavaScript exception:\n' + exception, severity: 'error', mode: 'panic' }] };
        }

        return result;
    }

    private async getRecommendVersion(sources: Source) {
        const pragmaRegx = /pragma solidity [\S ]+;/g;
        const semverList = [];
        // analyse semantic version from source code
        for (const key of Object.keys(sources)) {
            const match = sources[key].content.match(pragmaRegx);
            if (match) {
                const semverMatch = match[0].match(/[>=<]*[ ]*([0-9]+.[0-9]+.[0-9]+)/g);
                if (semverMatch) {
                    for (let index = 0; index < semverMatch.length; index++) {
                        semverList.push(semverMatch[index].replace(/ /g, ''));
                    }
                }
            }
        }
        // fetch candidate version list
        if (!this.solcVersionMap) {
            this.solcVersionMap = await SolcHttpClient.fetchVersions();
        }
        // find a match one
        const matchKey = semver.maxSatisfying(Object.keys(this.solcVersionMap), semverList.join(' '));
        return matchKey === null ? null : this.solcVersionMap[matchKey];
    }

    private formatCompilerVersionErrorMsg(sources: Source) {
        let errorMsg = "";
        const pragmaRegx = /pragma solidity [\S ]+;/g;
        for (const key of Object.keys(sources)) {
            const match = sources[key].content.match(pragmaRegx);
            if (match) {
                errorMsg += `${key} require : ${match[0]}\n`;
            }
        }
        return errorMsg;
    }

    private async resolveImport(sources: Source, missingImports: string[]) {
        const failureImport: string[] = [];
        for (const importPath of missingImports) {
            const imported = await this.resolver.resolve(importPath);
            if (imported !== undefined) {
                sources[importPath] = imported;
            } else {
                failureImport.push(importPath);
            };
        }
        return failureImport;
    }

    private async prepareCompiler(selectedVersion: string): Promise<boolean> {
        const destFile = path.resolve(path.join(this.cachePath, "solcCache", selectedVersion));
        await fs.promises.mkdir(path.dirname(destFile), { recursive: true });

        // download js file
        if (!fs.existsSync(destFile)) {
            const isSuccess = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (progress) => {
                progress.report({
                    message: `Download Solidity Compiler, version: '${selectedVersion}' ...`,
                });

                return await SolcHttpClient.downloadCompiler(selectedVersion, destFile);
            });
            if (!isSuccess) {
                return false;
            }
        }
        // reload instance
        if (this.compiler === undefined || selectedVersion !== this.usedCompilerVersion) {
            this.compiler = solc.setupMethods(require(destFile));
            this.usedCompilerVersion = selectedVersion;
        }
        return true;
    }

}

class Downloader {
    static fromHttp(url: string, destFile: string): Promise<boolean> {
        const file = fs.createWriteStream(destFile);
        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(`Error retrieving ${url}: ${response.statusMessage}`);
                } else {
                    file.on('finish', function () {
                        file.close();
                        resolve(true);
                    });
                    response.pipe(file);
                }
            }).on('error', function (error) {
                console.log(error);
                reject(false);
            });
        });
    }

    static fromIPFS(hash: string, destFile: string) {

    }
}

export class SolcHttpClient {

    static downloadCompiler(version: string, destFile: string): Promise<boolean> {
        const url = 'https://binaries.soliditylang.org/bin/' + version;
        return Downloader.fromHttp(url, destFile);
    }

    static fetchVersions(): Promise<SolcVersionMap> {
        const url = 'https://binaries.soliditylang.org/bin/list.json';
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    const binList = JSON.parse(body);
                    resolve(binList.releases);
                });
            }).on('error', (error) => {
                reject(error.message);
            });
        });
    }

}