import * as vscode from 'vscode';
import { SolcCompiler } from '../../common/solcCompiler';
import { userContext } from '../../common/userContext';
import { AstNode, AstWalker } from '@remix-project/remix-astwalker';
import { AstNodeType, CompilationResult, UserDefinedTypeNameAstNode, VariableDeclarationAstNode } from '../../common/type';

class SolidityImplementationProvider implements vscode.ImplementationProvider {

    private astNodeMap = new Map<number, AstNode>();
    private scopeNodeMap = new Map<number, AstNode[]>();
    private globalNodeIds = new Set<number>();
    private solc: SolcCompiler;
    private lastCompilationResult?: CompilationResult;
    private fileMap = new Map<number, string>();

    constructor(context: vscode.ExtensionContext) {
        this.solc = new SolcCompiler(context.extensionPath);
    }

    public provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
        if (!this.lastCompilationResult) {
            return [];
        }

        const cursorOffset = document.offsetAt(position);
        const links: vscode.Location[] = [];

        console.log('provideImplementation');
        // logic
        return links;
    }

    public async onEditorChange(document: vscode.TextDocument | undefined) {
        if (!document) {
            return;
        }

        this.solc.selectedCompilerVersion = userContext.selectedCompilerVersion;
        const result = await this.solc.analyseAst(document.fileName);
        const hasSource = result.sources && Object.keys(result.sources).length > 0;
        const hasFatal = this.solc.hasFatal(result.errors);
        if (!hasFatal && hasSource) {
            const tmpFileMap = new Map<number, string>();
            for (const filePath in result.sources) {
                tmpFileMap.set(result.sources[filePath].id, filePath);
            }

            const tmpScopeNodeMap = new Map<number, AstNode[]>();
            const tmpAstNodeMap = new Map<number, AstNode>();
            const tmpGlobalNodeIds = new Set<number>();
            for (const filePath in result.sources) {
                new AstWalker().walkFull(result.sources[filePath].ast, (node: AstNode) => {
                    const [offset, len, fileId] = node.src.split(':').map(value => parseInt(value));
                    if (!tmpFileMap.has(fileId)) {
                        return;
                    }
                    // find all scope
                    if (node.scope) {
                        if (!tmpScopeNodeMap.has(node.scope)) {
                            tmpScopeNodeMap.set(node.scope, []);
                        }
                        tmpScopeNodeMap.get(node.scope)!.push(node);
                    }
                    // save all ast node
                    tmpAstNodeMap.set(node.id, node);
                    // find global symbol
                    if (node.exportedSymbols) {
                        for (const symbolName of Object.keys(node.exportedSymbols)) {
                            tmpGlobalNodeIds.add((node.exportedSymbols[symbolName] as any)[0]);
                        }
                    }
                });
            }
            // save context
            this.globalNodeIds = tmpGlobalNodeIds;
            this.scopeNodeMap = tmpScopeNodeMap;
            this.astNodeMap = tmpAstNodeMap;
            this.lastCompilationResult = result;
            this.fileMap = tmpFileMap;
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    const implementaion = new SolidityImplementationProvider(context);

    if (vscode.window.activeTextEditor) {
        implementaion.onEditorChange(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(vscode.languages.registerImplementationProvider('solidity', implementaion));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => implementaion.onEditorChange(editor?.document)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => implementaion.onEditorChange(event.document)));
}

export function deactivate() {
}