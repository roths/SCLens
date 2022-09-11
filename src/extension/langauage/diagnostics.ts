import { SolcCompiler } from "../../common/solcCompiler";
import * as vscode from 'vscode';
import { getLineOffset, getSourceRange, getText } from "../../common/utils/file";
import { userContext } from "../../common/userContext";


let solc: SolcCompiler;
let diagnosticsCollection: vscode.DiagnosticCollection;

async function diagnostics(doc: vscode.TextDocument) {
    solc.selectedCompilerVersion = userContext.selectedCompilerVersion;
    const result = await solc.diagnostic(doc?.uri.fsPath);
    diagnosticsCollection.delete(doc.uri);
    if (result.errors) {
        const diagnosticMap: {
            [filePath: string]: vscode.Diagnostic[];
        } = {};
        const sourceCache = new Map<string, string>();
        for (const item of result.errors) {
            if (!item.sourceLocation) {
                continue;
            }
            const sourceText = sourceCache.get(item.sourceLocation.file) || await getText(item.sourceLocation.file);
            sourceCache.set(item.sourceLocation.file, sourceText);

            const lineOffset = getLineOffset(sourceText);
            const rangeObj = getSourceRange(lineOffset, item.sourceLocation!.start, item.sourceLocation.end);
            if (item.sourceLocation.end === -1 || item.sourceLocation.start === -1) {
                continue;
            }
            const range = new vscode.Range(rangeObj.startLine, rangeObj.startColum, rangeObj.endLine, rangeObj.endColum);

            diagnosticMap[item.sourceLocation.file] = diagnosticMap[item.sourceLocation.file] || [];
            const diagnostic = new vscode.Diagnostic(range, item.message!,
                item.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Information);
            diagnostic.code = item.component;

            diagnosticMap[item.sourceLocation.file].push(diagnostic);
        }

        for (const filePath in diagnosticMap) {
            diagnosticsCollection.set(vscode.Uri.parse(filePath), diagnosticMap[filePath]);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    solc = new SolcCompiler(context.extensionPath);
    diagnosticsCollection = vscode.languages.createDiagnosticCollection("solidity");

    if (vscode.window.activeTextEditor) {
        diagnostics(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => editor ? diagnostics(editor.document) : undefined));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => diagnostics(event.document)));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnosticsCollection.delete(doc.uri)));
    context.subscriptions.push(diagnosticsCollection);
}

export function deactivate() {
}
