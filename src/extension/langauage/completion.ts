import { AstNode, AstWalker } from '@remix-project/remix-astwalker';
import * as vscode from 'vscode';
import { SolcCompiler } from '../../common/solcCompiler';
import { AstNodeType, CompilationResult, ContractDefinitionAstNode, EnumDefinitionAstNode, UserDefinedTypeNameAstNode, EnumValueAstNode, FunctionDefinitionAstNode, IdentifierAstNode, StructDefinitionAstNode, VariableDeclarationAstNode } from '../../common/type';
import { userContext } from '../../common/userContext';

class SolidityCompletionItemProvider implements vscode.CompletionItemProvider {

    private astNodeMap = new Map<number, AstNode>();
    private scopeNodeMap = new Map<number, AstNode[]>();
    private globalNodeIds = new Set<number>();
    private solc: SolcCompiler;
    private lastCompilationResult?: CompilationResult;

    constructor(context: vscode.ExtensionContext) {
        this.solc = new SolcCompiler(context.extensionPath);
    }

    /**
     * ast tree + cursor position = completion items
     * @param document  
     * @param position 
     * @param token 
     * @param context 
     * @returns 
     */
    public provideCompletionItems(document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem> | vscode.CompletionItem[]> {
        if (!this.lastCompilationResult) {
            return [];
        }
        const cursorOffset = document.offsetAt(position);
        const fileMap = new Map<number, string>();
        for (const filePath in this.lastCompilationResult.sources) {
            fileMap.set(this.lastCompilationResult.sources[filePath].id, filePath);
        }
        const scopeChain: number[] = [];
        new AstWalker().walkFull(this.lastCompilationResult.sources![document.fileName].ast, (node: AstNode) => {
            const [offset, len, fileId] = node.src.split(':').map(value => parseInt(value));
            if (!fileMap.has(fileId)) {
                return;
            }
            if (cursorOffset >= offset && cursorOffset <= offset + len) {
                scopeChain.push(node.id);
            }
        });
        const completions: vscode.CompletionItem[] = [];

        const commitChar = document.getText(new vscode.Range(position.with({ character: position.character - 1 }), position));
        if (commitChar === '.') {
            // return field symbol completion,trigger by `.`
            const wordRange = document.getWordRangeAtPosition(position.with({ character: position.character - 1 }));
            if (wordRange) {
                const word = document.getText(wordRange);
                console.log('first word', word);
                let match = false;
                // find the first astNode name match with word in scope chain
                for (const scopeId of scopeChain.reverse()) {
                    const astNodes = this.scopeNodeMap.get(scopeId);
                    if (!astNodes) {
                        continue;
                    }
                    for (const astNode of astNodes) {
                        if (astNode.name && astNode.name === word) {
                            match = true;
                            // find field
                            console.log(astNode);
                            if (astNode.nodeType === AstNodeType.VariableDeclaration) {
                                const varDefNode = astNode as VariableDeclarationAstNode;
                                if (varDefNode.typeName.nodeType === AstNodeType.UserDefinedTypeName) {
                                    const type = (varDefNode.typeName as UserDefinedTypeNameAstNode);
                                    const scopeItems = this.scopeNodeMap.get(type.referencedDeclaration)!;
                                    for (const scopeItem of scopeItems) {
                                        completions.push(...parseAstToCompletionItem(scopeItem));
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
                if (!match) {
                    // find the first astNode name match with word in global scope
                    for (const astNodeId of this.globalNodeIds) {
                        const astNode = this.astNodeMap.get(astNodeId);
                        if (!astNode) {
                            continue;
                        }
                        if (astNode.name && astNode.name === word) {
                            match = true;
                            // find field
                            console.log(astNode);
                            const scopeItems = this.scopeNodeMap.get(astNode.id)!;
                            for (const scopeItem of scopeItems) {
                                completions.push(...parseAstToCompletionItem(scopeItem));
                            }
                            break;
                        }
                    }
                }
            }
        } else {
            // return scope symbol completion
            for (const scopeId of scopeChain) {
                const astNodes = this.scopeNodeMap.get(scopeId);
                if (!astNodes) {
                    continue;
                }
                for (const astNode of astNodes) {
                    // const [offset, len, fileId] = astNode.src.split(':').map(value => parseInt(value));
                    // can not use a symbol defined after cursor in lowest scope
                    // if (offset >= cursorOffset) {
                    //     continue;
                    // }
                    completions.push(...parseAstToCompletionItem(astNode));
                }
            }
            // return global symbol completion
            for (const astNodeId of this.globalNodeIds) {
                completions.push(...parseAstToCompletionItem(this.astNodeMap.get(astNodeId)!));
            }
        }

        return completions;
    }

    public async onEditorChange(document: vscode.TextDocument | undefined) {
        if (!document) {
            return;
        }

        this.solc.selectedCompilerVersion = userContext.selectedCompilerVersion;
        const result = await this.solc.analyseAst(document.fileName);
        const hasSource = result.sources && Object.keys(result.sources).length > 0;
        let noFatalErr = true;
        result.errors?.forEach(err => {
            if (err.severity === 'error') {
                noFatalErr = false;
            }
        });
        if (noFatalErr && hasSource) {
            const fileMap = new Map<number, string>();
            for (const filePath in result.sources) {
                fileMap.set(result.sources[filePath].id, filePath);
            }

            const tmpScopeNodeMap = new Map<number, AstNode[]>();
            const tmpAstNodeMap = new Map<number, AstNode>();
            const tmpGlobalNodeIds = new Set<number>();
            for (const filePath in result.sources) {
                new AstWalker().walkFull(result.sources[filePath].ast, (node: AstNode) => {
                    const [offset, len, fileId] = node.src.split(':').map(value => parseInt(value));
                    if (!fileMap.has(fileId)) {
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
        }
    }

}

function parseAstToCompletionItem(node: AstNode) {
    const completions: vscode.CompletionItem[] = [];
    switch (node.nodeType) {
        case AstNodeType.ContractDefinition: {
            const contractDefNode = node as ContractDefinitionAstNode;
            completions.push(new vscode.CompletionItem(contractDefNode.name, vscode.CompletionItemKind.Class));
        }
            break;
        case AstNodeType.FunctionDefinition: {
            const funcDefNode = node as FunctionDefinitionAstNode;
            const item = new vscode.CompletionItem(funcDefNode.name, vscode.CompletionItemKind.Method);
            completions.push(item);
        }
            break;
        case AstNodeType.VariableDeclaration: {
            const varDefNode = node as VariableDeclarationAstNode;
            const item = new vscode.CompletionItem(varDefNode.name, vscode.CompletionItemKind.Variable);
            completions.push(item);
        }
            break;
        case AstNodeType.EnumDefinition: {
            const enumDefNode = node as EnumDefinitionAstNode;
            const item = new vscode.CompletionItem(enumDefNode.name, vscode.CompletionItemKind.Enum);
            completions.push(item);
        }
            break;

        case AstNodeType.EnumValue: {
            const enumValueNode = node as EnumDefinitionAstNode;
            const item = new vscode.CompletionItem(enumValueNode.name, vscode.CompletionItemKind.EnumMember);
            item.commitCharacters = ['.'];
            completions.push(item);
        }
            break;
        case AstNodeType.StructDefinition: {
            const structDefNode = node as StructDefinitionAstNode;
            const item = new vscode.CompletionItem(structDefNode.name, vscode.CompletionItemKind.Class);
            completions.push(item);
        }
            break;

        default:
        // console.log('not handler nodeType', node.nodeType);
    }
    return completions;
}

export function activate(context: vscode.ExtensionContext) {
    const compilation = new SolidityCompletionItemProvider(context);

    if (vscode.window.activeTextEditor) {
        compilation.onEditorChange(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('solidity', compilation, '.'));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => compilation.onEditorChange(editor?.document)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => compilation.onEditorChange(event.document)));
}

export function deactivate() {
}