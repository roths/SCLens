import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export const eventCenter = new EventEmitter();

export enum LanguageEvent {
    diagnostics = 'diagnostics',
    ast = 'ast',
}

export function getCurActiveDoc(): string | undefined {
    if (vscode.window.activeTextEditor) {
        return vscode.window.activeTextEditor.document.fileName;
    }
    return undefined;
}