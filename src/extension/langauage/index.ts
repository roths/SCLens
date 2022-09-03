
import * as vscode from 'vscode';
import * as completionModule from './completion';
import * as diagnostModule from './diagnostics';
import * as definitionModule from './definition';
import * as implementationModule from './implementation';

export function activate(context: vscode.ExtensionContext) {
    diagnostModule.activate(context);
    completionModule.activate(context);
    definitionModule.activate(context);
    // implementationModule.activate(context);
}

export function deactivate() {
    diagnostModule.deactivate();
    completionModule.deactivate();
    definitionModule.deactivate();
    implementationModule.deactivate();
}