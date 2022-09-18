import * as vscode from 'vscode';
import { SolcCompiler } from '../../solidity/compiler/solcCompiler';
import { CompilationError, CompilationResult, Source } from '../../solidity/type';
import { userContext } from '../../common/userContext';
import { getText } from '../../common/utils/file';
import { eventCenter, LanguageEvent } from './common';

enum EventType {
    CHANGE,
    CREATE,
    DELETE
}

class FileWatcher {
    private workspaceFileSet = new Set<string>();
    // fatal file will be filtered
    private fatalFileSet = new Set<string>();
    private fileErrorMap = new Map<string, CompilationError[]>;
    private solc: SolcCompiler;

    constructor(context: vscode.ExtensionContext) {
        this.solc = new SolcCompiler(context.extensionPath);
        this.solc.addImportInterceptor((file: string) => {
            if (this.fatalFileSet.has(file)) {
                return null;
            }
            return undefined;
        });
    }

    public async onFileChange(type: EventType, rawEvent: vscode.TextDocumentChangeEvent | vscode.FileDeleteEvent | vscode.FileCreateEvent) {
        switch (type) {
            case EventType.CHANGE: {
                const event = rawEvent as vscode.TextDocumentChangeEvent;
                await this.throttle();
            }
                break;
            case EventType.DELETE: {
                const event = rawEvent as vscode.FileDeleteEvent;
                for (const iterator of event.files) {
                    this.workspaceFileSet.delete(iterator.path);
                }
                await this.throttle();
            }
                break;
            case EventType.CREATE: {
                const event = rawEvent as vscode.FileCreateEvent;
                for (const iterator of event.files) {
                    this.workspaceFileSet.add(iterator.path);
                }
                await this.throttle();
            }
                break;
        }
    }

    private task: NodeJS.Timeout | null = null;
    private async throttle() {
        if (this.task !== null) {
            clearTimeout(this.task);
        }
        this.task = setTimeout(() => {
            this.task = null;
            this.analyseAll();
        }, 200);
    }

    private async analyseAll() {
        this.solc.selectedCompilerVersion = userContext.selectedCompilerVersion;

        const sources: Source = {};
        for (const sourcePath of this.workspaceFileSet) {
            sources[sourcePath] = { content: await getText(sourcePath) };
        }
        this.fatalFileSet.clear();
        this.fileErrorMap.clear();

        const result = await this.analyseAllInner(sources);
        // console.log('analyseAll result', result);
        // console.log('analyseAll fatalFileSet', this.fatalFileSet);
        // console.log('analyseAll fileErrorMap', this.fileErrorMap);

        this.sendEvent(LanguageEvent.diagnostics, this.fileErrorMap);
        this.sendEvent(LanguageEvent.ast, result);
    }

    private async analyseAllInner(sources: Source): Promise<CompilationResult> {
        for (const key of this.fatalFileSet.keys()) {
            delete sources[key];
        }
        const result = await this.solc.analyseSourceAst(sources);
        const hasFatal = this.solc.hasFatal(result.errors);
        if (hasFatal) {
            const fatals = this.solc.getFatals(result.errors);
            for (const fatal of fatals) {
                this.fatalFileSet.add(fatal.sourceLocation!.file);
                if (!this.fileErrorMap.has(fatal.sourceLocation!.file)) {
                    this.fileErrorMap.set(fatal.sourceLocation!.file, []);
                }
                this.fileErrorMap.get(fatal.sourceLocation!.file)?.push(fatal);
            }
            return await this.analyseAllInner(sources);
        } else {
            for (const error of result.errors ?? []) {
                if (!this.fileErrorMap.has(error.sourceLocation!.file)) {
                    this.fileErrorMap.set(error.sourceLocation!.file, []);
                }
                this.fileErrorMap.get(error.sourceLocation!.file)?.push(error);
            }
        }
        return result;
    }

    private sendEvent(event: string, ...args: any[]): void {
        setTimeout(() => {
            eventCenter.emit(event, ...args);
        }, 0);
    }
}


async function getWorkspaceFiles() {
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

export async function activate(context: vscode.ExtensionContext) {
    const fileCompileManager = new FileWatcher(context);
    const files = await getWorkspaceFiles();
    fileCompileManager.onFileChange(EventType.CREATE, { files });
    // if (vscode.window.activeTextEditor) {
    //     implementaion.onEditorChange(vscode.window.activeTextEditor.document);
    // }

    // context.subscriptions.push(vscode.languages.registerImplementationProvider('solidity', implementaion));
    // context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => implementaion.onEditorChange(editor?.document)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => fileCompileManager.onFileChange(EventType.CHANGE, event)));
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(event => fileCompileManager.onFileChange(EventType.DELETE, event)));
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(event => fileCompileManager.onFileChange(EventType.CREATE, event)));
}

export function deactivate() {
}