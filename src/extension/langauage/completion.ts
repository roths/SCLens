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
        const scopeChain = getScopeChain(cursorOffset, this.lastCompilationResult.sources![document.fileName].ast, fileMap);

        const completions: vscode.CompletionItem[] = [];

        const commitChar = document.getText(new vscode.Range(position.with({ character: position.character - 1 }), position));
        if (commitChar === '.') {
            // return field symbol completion,trigger by `.`
            const wordRange = document.getWordRangeAtPosition(position.with({ character: position.character - 1 }), /[a-zA-Z_. \n]+/);
            if (!wordRange) {
                return completions;
            }
            const wordStr = document.getText(wordRange).replace(/[ \n]/g, '');
            console.log('completion trigger word', wordStr);
            const callChain = wordStr.split('.').filter(value => value !== '');
            // find scope symbol
            let targetAstNode: AstNode | undefined = this.findAstNodeFromScope(callChain[0], scopeChain);
            if (targetAstNode) {
                // find field symbol
                for (const fieldName of callChain.slice(1)) {
                    targetAstNode = this.findAstNodeFromChild(targetAstNode!, fieldName);
                    if (!targetAstNode) {
                        break;
                    }
                }
            }
            if (!targetAstNode) {
                console.error("can not find completion astNode", wordStr);
                return completions;
            }

            const children = new AstWalker().getASTNodeChildren(targetAstNode);
            for (const child of children) {
                completions.push(...parseAstToCompletionItem(child));
            }

        } else {
            const completionNodeIdSet = new Set<number>();
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
                    completionNodeIdSet.add(astNode.id);
                    completions.push(...parseAstToCompletionItem(astNode));
                }
            }
            // return global symbol completion
            for (const astNodeId of this.globalNodeIds) {
                if (completionNodeIdSet.has(astNodeId)) {
                    continue;
                }
                completionNodeIdSet.add(astNodeId);
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

    private findAstNodeFromChild(parent: AstNode, fieldName: string) {
        let result: AstNode | undefined;
        const children = new AstWalker().getASTNodeChildren(parent);
        for (const child of children) {
            if (!child.name || child.name !== fieldName) {
                continue;
            }

            // unwrap var decalration
            if (child.nodeType === AstNodeType.VariableDeclaration) {
                const varDefNode = result as VariableDeclarationAstNode;
                if (varDefNode.typeName.nodeType === AstNodeType.UserDefinedTypeName) {
                    const type = (varDefNode.typeName as UserDefinedTypeNameAstNode);
                    result = this.astNodeMap.get(type.referencedDeclaration)!;
                } else {
                    result = varDefNode.typeName;
                }
            } else {
                result = child;
            }
            break;
        }
        return result;
    }

    private findAstNodeFromScope(invoker: string, scopeChain: number[]) {
        let result: AstNode | undefined;
        for (const scopeId of scopeChain.reverse()) {
            // find the first astNode name match with `invoker` in scope chain
            const astNodes = this.scopeNodeMap.get(scopeId);
            if (!astNodes) {
                continue;
            }
            for (const astNode of astNodes) {
                if (!astNode.name || astNode.name !== invoker) {
                    continue;
                }
                // unwrap var decalration
                if (astNode.nodeType === AstNodeType.VariableDeclaration) {
                    const varDefNode = astNode as VariableDeclarationAstNode;
                    if (varDefNode.typeName.nodeType === AstNodeType.UserDefinedTypeName) {
                        const type = (varDefNode.typeName as UserDefinedTypeNameAstNode);
                        result = this.astNodeMap.get(type.referencedDeclaration)!;
                    } else {
                        result = varDefNode.typeName;
                    }
                } else {
                    result = astNode;
                }
                break;
            }
        }

        if (result) {
            return result;
        }

        // find the first astNode name match with word in global scope
        for (const astNodeId of this.globalNodeIds) {
            const astNode = this.astNodeMap.get(astNodeId);
            if (!astNode) {
                continue;
            }
            if (astNode.name && astNode.name === invoker) {
                // find field
                result = astNode;
                break;
            }
        }
        return result;
    }

}


function getScopeChain(cursorOffset: number, astTree: AstNode, validFileMap: Map<number, string>) {
    const scopeChain: number[] = [];
    new AstWalker().walkFull(astTree, (node: AstNode) => {
        const [offset, len, fileId] = node.src.split(':').map(value => parseInt(value));
        if (!validFileMap.has(fileId)) {
            return;
        }
        if (cursorOffset >= offset && cursorOffset <= offset + len) {
            scopeChain.push(node.id);
        }
    });
    return scopeChain;
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