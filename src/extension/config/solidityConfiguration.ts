import path from 'path';
import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

export class SolidityConfigurationProvider implements vscode.DebugConfigurationProvider {

    public static readonly debugType = 'solidity';

    constructor(context: vscode.ExtensionContext) {

        context.subscriptions.push(vscode.commands.registerCommand('extension.solidity-debug.getProgramName', async config => {
            const fileList: { [releativePath: string]: vscode.Uri; } = {};
            for (const iterator of vscode.workspace.workspaceFolders ?? []) {
                const workspacePath = iterator.uri.fsPath;
                const pattern = new vscode.RelativePattern(
                    workspacePath,
                    '**/*.sol'
                );
                const files = await vscode.workspace.findFiles(
                    pattern,
                    '**​/.vscode/**'
                );
                files.forEach((item) => {
                    fileList[item.path.replace(workspacePath + path.sep, '')] = item;
                });
            }
            return vscode.window.showQuickPick(Object.keys(fileList), {
                placeHolder: "Please enter a solidity file"
            });
        }));
    }
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'solidity') {
                config.type = 'solidity';
                config.name = 'Launch Solidity';
                config.request = 'launch';
                config.program = '${file}';
                config.stopOnEntry = true;
            }
        }

        if (!config.program) {
            return vscode.window.showErrorMessage("Cannot find a program to debug").then(_ => {
                return undefined;	// abort launch
            });
        }

        return config;
    }

    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(SolidityConfigurationProvider.debugType,
            new SolidityConfigurationProvider(context)));
    }
}