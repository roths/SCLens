import * as vscode from 'vscode';
import { MockDebugSession } from '../mockDebug';
import { workspaceFileAccessor } from '../utils/file';

export class SolidityDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	public static readonly debugType = 'solidity';
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new MockDebugSession(this.context, workspaceFileAccessor));
	}

	public static register(context: vscode.ExtensionContext) {
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(SolidityDebugAdapterFactory.debugType,
			new SolidityDebugAdapterFactory(context)));
	}
}