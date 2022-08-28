
import * as vscode from 'vscode';
import { SolidityDebugAdapterFactory } from './adapterFactory';
import { SolidityConfigurationProvider } from './configurationProvider';


export function activate(context: vscode.ExtensionContext) {
	SolidityConfigurationProvider.register(context);
	SolidityDebugAdapterFactory.register(context);
}

export function deactivate() {
}