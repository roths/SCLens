
import * as vscode from 'vscode';
import * as completionModule from './completion';
import * as diagnostModule from './diagnostics';
import * as definitionModule from './definition';
import * as fileWatcherModule from './fileWatcher';

export function activate(context: vscode.ExtensionContext) {
    diagnostModule.activate(context);
    completionModule.activate(context);
    definitionModule.activate(context);
    fileWatcherModule.activate(context);
}

export function deactivate() {
    diagnostModule.deactivate();
    completionModule.deactivate();
    definitionModule.deactivate();
    fileWatcherModule.deactivate();
}