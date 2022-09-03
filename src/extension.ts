// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { userContext } from './common/userContext';
import * as debugModule from './extension/debug';
import * as lspModule from './extension/lsp';
import * as uiModule from './extension/ui';
import * as langauageModule from './extension/langauage';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 'workspaceHasSolidity', true);

	userContext.activate(context);

	debugModule.activate(context);
	uiModule.activate(context);
	// lspModule.activate(context);
	langauageModule.activate(context);
	
	console.log('ScLens extension active!');
}

// this method is called when your extension is deactivated
export function deactivate() {
	userContext.deactivate();
	
	debugModule.deactivate();
	uiModule.deactivate();
	lspModule.deactivate();
	langauageModule.deactivate();

	console.log('ScLens extension deactivate!');
}
