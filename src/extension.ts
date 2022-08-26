// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { userContext } from './common/userContext';
import { SolidityConfigurationProvider } from './extension/config/solidityConfiguration';
import { SolidityDebugAdapterFactory } from './extension/config/solidityDebugAdapterFactory';
import { activateLspClient, deactivateLspClient } from './extension/lspClient';
import { HistoryTreeViewProvider } from './extension/ui/historyTreeView';
import { InstructionListViewProvider } from './extension/ui/instructionListView';
import { SettingsTreeViewProvider } from './extension/ui/settingsTreeView';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 'workspaceHasSolidity', true);

	userContext.activate(context);

	SolidityConfigurationProvider.register(context);
	SolidityDebugAdapterFactory.register(context);
	HistoryTreeViewProvider.register(context);
	SettingsTreeViewProvider.register(context);
	// context.subscriptions.push(vscode.window.registerWebviewViewProvider(SettingsWebViewProvider.viewId, new SettingsWebViewProvider(context)));
	InstructionListViewProvider.register(context);

	activateLspClient(context);
	console.log('ScLens extension active!');
}

// this method is called when your extension is deactivated
export function deactivate() {
	userContext.deactivate();
	deactivateLspClient();

	console.log('ScLens extension deactivate!');
}
