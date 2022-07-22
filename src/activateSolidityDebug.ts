import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { MockDebugSession } from './mockDebug';
import { FileAccessor } from './mockRuntime';

export function activateSolidityDebug(context: vscode.ExtensionContext, factory: vscode.DebugAdapterDescriptorFactory) {
	// register a configuration provider for 'mock' debug type
	const provider = new SolidityConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('solidity', provider));

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
				fileList[item.path.replace(workspacePath, '')] = item;
			});
		}
		return vscode.window.showQuickPick(Object.keys(fileList), {
			placeHolder: "Please enter the name of a solidity file in the workspace folder"
		});
	}));

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('solidity', factory));
}

class SolidityConfigurationProvider implements vscode.DebugConfigurationProvider {

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
}

export const workspaceFileAccessor: FileAccessor = {
	async readFile(path: string): Promise<Uint8Array> {
		let uri: vscode.Uri;
		try {
			uri = pathToUri(path);
		} catch (e) {
			return new TextEncoder().encode(`cannot read '${path}'`);
		}

		return await vscode.workspace.fs.readFile(uri);
	},
	async writeFile(path: string, contents: Uint8Array) {
		await vscode.workspace.fs.writeFile(pathToUri(path), contents);
	}
};

function pathToUri(path: string) {
	try {
		return vscode.Uri.file(path);
	} catch (e) {
		return vscode.Uri.parse(path);
	}
}

export class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new MockDebugSession(workspaceFileAccessor));
	}
}