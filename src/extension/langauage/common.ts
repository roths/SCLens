import * as vscode from 'vscode';
import { SolcCompiler } from '../../solidity/compiler/solcCompiler';
import { CompilationError, Source } from '../../solidity/type';
import { userContext } from '../../common/userContext';
import { getText } from '../../common/utils/file';

enum EventType {
    CHANGE,
    CREATE,
    DELETE
}

class DependencyTreeNode {

}

class FilePreCompileManager {
    private fileSet = new Set<string>();
    private fileFatalMap = new Map<string, CompilationError[]>();
    private solc: SolcCompiler;


    constructor(context: vscode.ExtensionContext) {
        this.solc = new SolcCompiler(context.extensionPath);
    }

    public async analyseAll() {
        this.solc.selectedCompilerVersion = userContext.selectedCompilerVersion;

        const sources: Source = {};
        for (const sourcePath of this.fileSet) {
            sources[sourcePath] = { content: await getText(sourcePath) };
        }

        const result = await this.solc.analyseSourceAst(sources);
        const hasSource = result.sources && Object.keys(result.sources).length > 0;
        const hasFatal = this.solc.hasFatal(result.errors);
        if (hasFatal) {
            const fatalError = this.solc.getFatal(result.errors);
            // if (fatalError) {
            //     fileFatalMap.get();
            // }
        }
        console.log('compile all', result);
    }

    public async onChange(type: EventType, rawEvent: vscode.TextDocumentChangeEvent | vscode.FileDeleteEvent | vscode.FileCreateEvent) {
        switch (type) {
            case EventType.CHANGE: {
                const event = rawEvent as vscode.TextDocumentChangeEvent;
                await this.analyseAll();
            }
                break;
            case EventType.DELETE: {
                const event = rawEvent as vscode.FileDeleteEvent;
                for (const iterator of event.files) {
                    this.fileSet.delete(iterator.path);
                }
                await this.analyseAll();
            }
                break;
            case EventType.CREATE: {
                const event = rawEvent as vscode.FileCreateEvent;
                for (const iterator of event.files) {
                    this.fileSet.add(iterator.path);
                }
                await this.analyseAll();
            }
                break;
        }
    }

    public async getWorkspaceFiles() {
        const fileList: vscode.Uri[] = [];
        for (const iterator of vscode.workspace.workspaceFolders ?? []) {
            const workspacePath = iterator.uri.fsPath;
            const pattern = new vscode.RelativePattern(
                workspacePath,
                '**/*.sol'
            );
            const files = await vscode.workspace.findFiles(
                pattern,
                '**​/.vscode/**'
            );
            fileList.push(...files);
        }
        return fileList;
    }

}

export async function activate(context: vscode.ExtensionContext) {

    const fileCompileManager = new FilePreCompileManager(context);
    const files = await fileCompileManager.getWorkspaceFiles();
    fileCompileManager.onChange(EventType.CREATE, { files });
    // if (vscode.window.activeTextEditor) {
    //     implementaion.onEditorChange(vscode.window.activeTextEditor.document);
    // }

    // context.subscriptions.push(vscode.languages.registerImplementationProvider('solidity', implementaion));
    // context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => implementaion.onEditorChange(editor?.document)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => fileCompileManager.onChange(EventType.CHANGE, event)));
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(event => fileCompileManager.onChange(EventType.DELETE, event)));
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(event => fileCompileManager.onChange(EventType.CREATE, event)));
}

export function deactivate() {
}