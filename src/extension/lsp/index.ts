import * as vscode from 'vscode';
import { activateLspClient, deactivateLspClient } from './client';

export function activate(context: vscode.ExtensionContext) {
    activateLspClient(context);
}

export function deactivate() {
    deactivateLspClient();
}
