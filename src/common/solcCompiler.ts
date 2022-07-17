import * as fs from 'fs';
import * as https from 'https';
import * as solc from 'solc';
import * as path from 'path';
import * as vscode from 'vscode';
import { CompilationResult, Source, CompilationError } from './type';
import { ImportResolver } from './importResolver';


export class SolcCompiler {

    private rootPath: string;
    private cachePath: string;
    private compiler: any;
    private compilerVersion: string = 'soljson-v0.8.15+commit.e14f2714.js';
    private resolver: ImportResolver;

    constructor(rootPath: string, cachePath: string) {
        this.rootPath = rootPath;
        this.cachePath = cachePath;
        this.resolver = new ImportResolver(cachePath);
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
        await this.prepareCompiler(this.compilerVersion);

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
            if (hasFatalErrors) {
                result = { errors: [{ formattedMessage: 'Uncaught Solidity compile exception:\n' + result.errors, severity: 'error', mode: 'panic' }] };
            } else if (missingImports.length > 0) {
                const failureImport = await this.resolveImport(sources, missingImports);
                if (failureImport.length === 0) {
                    return this.execSolc(sources, settings);
                } else {
                    return { errors: [{ formattedMessage: 'Fail to resolve import:\n' + failureImport, severity: 'error', mode: 'panic' }] };
                }
            }
        } catch (exception) {
            result = { errors: [{ formattedMessage: 'Uncaught JavaScript exception:\n' + exception, severity: 'error', mode: 'panic' }] };
        }

        return result;
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

    private async prepareCompiler(version: string): Promise<boolean> {
        const destFile = path.resolve(path.join(this.cachePath, version));
        if (!fs.existsSync(destFile)) {
            const isSuccess = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (progress) => {
                progress.report({
                    message: `Download Solidity Compiler, version: '${version}' ...`,
                });

                return await SolcHttpClient.downloadCompiler(version, destFile);
            });
            if (!isSuccess) {
                return false;
            }
        }
        if (this.compiler === undefined || version !== this.compilerVersion) {
            this.compiler = solc.setupMethods(require(destFile));
            this.compilerVersion = version;
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

    static fetchVersions(): Promise<any> {
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