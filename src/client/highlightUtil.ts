import * as vscode from 'vscode';

/* DECORATOR */

export class Decorator {

    private type = vscode.window.createTextEditorDecorationType({
        light: { backgroundColor: '#d2e4f3' },
        dark: { backgroundColor: '#273853' }
    });

    private cache: vscode.TextEditor | null = null;

    decorate(target: vscode.TextEditor, startLine: number, startColum: number, endLine: number, endColum: number) {
        this.clear();
        target.setDecorations(this.type, [new vscode.Range(
            new vscode.Position(startLine, startColum),
            new vscode.Position(endLine, endColum)
        )]);
        this.cache = target;
    }

    clear() {
        if (this.cache !== null) {
            this.cache.setDecorations(this.type, []);
            this.cache = null;
        }
    }
}