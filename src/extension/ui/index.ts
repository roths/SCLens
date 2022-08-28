import * as vscode from 'vscode';
import { HistoryTreeViewProvider } from './historyTreeView';
import { InstructionListViewProvider } from './instructionListView';
import { SettingsTreeViewProvider } from './settingsTreeView';

export function activate(context: vscode.ExtensionContext) {
    HistoryTreeViewProvider.register(context);
    SettingsTreeViewProvider.register(context);
    // context.subscriptions.push(vscode.window.registerWebviewViewProvider(SettingsWebViewProvider.viewId, new SettingsWebViewProvider(context)));
    InstructionListViewProvider.register(context);
}

export function deactivate() {
}
