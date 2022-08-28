import { util } from "@remix-project/remix-lib";
import * as vscode from 'vscode';
import path from "path";

export function getLineOffset(source: string) {
    const ret = [];
    ret.push(0);
    for (let pos = source.indexOf('\n'); pos >= 0; pos = source.indexOf('\n', pos + 1)) {
        ret.push(pos);
    }
    return ret;
}

export function getSourceRange(lineOffset: number[], start: number, end: number) {
    const length = end - start;
    const startLine = util.findLowerBound(start, lineOffset);
    const startColum = start - lineOffset[startLine] - 1;
    const endLine = util.findLowerBound(start + length - 1, lineOffset);
    const endColum = start + length - lineOffset[endLine] - 1;
    return { startLine, startColum, endLine, endColum };
}

export async function getText(filePath: string) {
    const uri = pathToUri(filePath);
    const doc = vscode.workspace.textDocuments.filter((item) => item.fileName === uri.fsPath);
    if (doc.length > 0) {
        return doc[0].getText();
    } else {
        return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    }
}

export async function writeText(filePath: string, text: string) {
    await vscode.workspace.fs.createDirectory(pathToUri(path.dirname(filePath)));
    await vscode.workspace.fs.writeFile(pathToUri(filePath), new TextEncoder().encode(text));
}

function pathToUri(path: string) {
    try {
        return vscode.Uri.file(path);
    } catch (e) {
        return vscode.Uri.parse(path);
    }
}
