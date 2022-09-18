import EventEmitter from 'events';
import * as vscode from 'vscode';
import { getLineOffset, getSourceRange, getText } from "../../common/utils/file";
import { CompilationError } from "../../solidity/type";
import { eventCenter, LanguageEvent } from './common';


let diagnosticsCollection: vscode.DiagnosticCollection;

async function diagnostics(fileErrorMap: Map<string, CompilationError[]>) {

    diagnosticsCollection.clear();
    const allError: CompilationError[] = [];
    for (const [file, errors] of fileErrorMap) {
        allError.push(...errors);
    }

    const diagnosticMap: {
        [filePath: string]: vscode.Diagnostic[];
    } = {};
    const sourceCache = new Map<string, string>();
    for (const item of allError) {
        if (!item.sourceLocation) {
            continue;
        }
        const sourceText = sourceCache.get(item.sourceLocation.file) || await getText(item.sourceLocation.file);
        sourceCache.set(item.sourceLocation.file, sourceText);
        const lineOffset = getLineOffset(sourceText);
        const rangeObj = getSourceRange(lineOffset, item.sourceLocation!.start, item.sourceLocation.end);
        if (item.sourceLocation.end === -1 || item.sourceLocation.start === -1 || rangeObj.startColum === -1 || rangeObj.endColum === -1) {
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


export function activate(context: vscode.ExtensionContext) {
    diagnosticsCollection = vscode.languages.createDiagnosticCollection("solidity");
    context.subscriptions.push(diagnosticsCollection);
    eventCenter.on(LanguageEvent.diagnostics, diagnostics);
}

export function deactivate() {
}
