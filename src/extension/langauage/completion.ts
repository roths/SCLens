import * as vscode from 'vscode';
import { AstWalker } from '../../solidity/compiler/astWalker';
import { instanceField, definitionField, AstNodeType, CompilationResult, ContractDefinitionAstNode, EnumDefinitionAstNode, UserDefinedTypeNameAstNode, EnumValueAstNode, FunctionDefinitionAstNode, IdentifierAstNode, StructDefinitionAstNode, VariableDeclarationAstNode, AstNode } from '../../solidity/type';
import { eventCenter, getCurActiveDoc, LanguageEvent } from './common';

class SolidityCompletionItemProvider implements vscode.CompletionItemProvider {

    private astNodeMap = new Map<number, AstNode>();
    private scopeNodeMap = new Map<number, AstNode[]>();
    private lastCompilationResult?: CompilationResult;
    private fileMap = new Map<number, string>();

    constructor() {
        eventCenter.on(LanguageEvent.ast, this.onAstChange.bind(this));
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
        if (!this.lastCompilationResult
            || !this.lastCompilationResult.sources
            || !this.lastCompilationResult.sources[document.fileName]) {
            return [];
        }

        const curFileAst = this.lastCompilationResult.sources[document.fileName].ast;
        const cursorOffset = document.offsetAt(position);
        const scopeChain = getScopeChain(cursorOffset, curFileAst, this.fileMap);

        const completions: vscode.CompletionItem[] = [];

        const wordRange = document.getWordRangeAtPosition(position.with({ character: position.character - 1 }), /[a-zA-Z_0-9. \n]+/);
        if (!wordRange) {
            return completions;
        }
        const wordStr = document.getText(wordRange).replace(/[ \n]/g, '');
        console.log('completion trigger word', wordStr);
        if (wordStr.indexOf('.') !== -1) {
            // return field symbol completion,trigger by `.`
            const wordRange = document.getWordRangeAtPosition(position.with({ character: position.character - 1 }), /[a-zA-Z_0-9. \n]+/);
            if (!wordRange) {
                return completions;
            }
            const wordStr = document.getText(wordRange).replace(/[ \n]/g, '');
            // remove last one
            const callChain = wordStr.split('.').slice(0, -1);
            // find scope symbol
            let [targetAstNode, isInstance] = this.findAstNodeFromScope(callChain[0], scopeChain, curFileAst);
            if (targetAstNode) {
                // find field symbol
                for (const fieldName of callChain.slice(1)) {
                    [targetAstNode, isInstance] = this.findAstNodeFromChild(targetAstNode!, fieldName);
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
                const filter = this.filterByInstance(isInstance, child);
                if (filter) {
                    continue;
                }
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
            for (const astNodeId of getExportedSymbolIds(curFileAst)) {
                if (completionNodeIdSet.has(astNodeId)) {
                    continue;
                }
                completionNodeIdSet.add(astNodeId);
                completions.push(...parseAstToCompletionItem(this.astNodeMap.get(astNodeId)!));
            }
        }

        return completions;
    }

    public async onAstChange(result: CompilationResult) {
        const hasSource = result.sources && Object.keys(result.sources).length > 0;
        if (!hasSource) {
            return;
        }
        const curActiveDoc = getCurActiveDoc();
        if (curActiveDoc) {
            const hasSourceInLastResult = this.lastCompilationResult && this.lastCompilationResult.sources && this.lastCompilationResult.sources[curActiveDoc];
            const hasSourceInNewResult = result.sources && result.sources[curActiveDoc];
            if (hasSourceInLastResult && !hasSourceInNewResult) {
                // maybe editing content
                return;
            }
        }

        const tmpFileMap = new Map<number, string>();
        for (const filePath in result.sources) {
            tmpFileMap.set(result.sources[filePath].id, filePath);
        }

        const tmpScopeNodeMap = new Map<number, AstNode[]>();
        const tmpAstNodeMap = new Map<number, AstNode>();
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
            });
        }
        // save context
        this.scopeNodeMap = tmpScopeNodeMap;
        this.astNodeMap = tmpAstNodeMap;
        this.lastCompilationResult = result;
        this.fileMap = tmpFileMap;
    }

    private filterByInstance(isInstance: boolean, childNode: AstNode): boolean {
        let isFilter = false;
        if (isInstance) {
            if (instanceField.indexOf(childNode.nodeType as AstNodeType) === -1) {
                isFilter = true;
                console.log('target node is instance, filter', childNode);
            }
        } else {
            if (definitionField.indexOf(childNode.nodeType as AstNodeType) === -1) {
                isFilter = true;
                console.log('target node is class, filter', childNode);
            }
        }
        return isFilter;
    }

    private findAstNodeFromChild(parent: AstNode, fieldName: string): [AstNode | undefined, boolean] {
        let result: AstNode | undefined;
        let isInstance = false;
        const children = new AstWalker().getASTNodeChildren(parent);
        for (const child of children) {
            if (!child.name || child.name !== fieldName) {
                continue;
            }

            // unwrap var decalration
            if (child.nodeType === AstNodeType.VariableDeclaration) {
                isInstance = true;
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
        return [result, isInstance];
    }

    private findAstNodeFromScope(invoker: string, scopeChain: number[], curFileAst: AstNode): [AstNode | undefined, boolean] {
        let result: AstNode | undefined;
        let isInstance = false;
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
                    isInstance = true;
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
            return [result, isInstance];
        }

        // find the first astNode name match with word in global scope
        for (const astNodeId of getExportedSymbolIds(curFileAst)) {
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
        return [result, isInstance];
    }

}

function getExportedSymbolIds(node: AstNode) {
    const exportIds = new Set<number>();
    if (node.exportedSymbols) {
        for (const symbolName of Object.keys(node.exportedSymbols)) {
            exportIds.add((node.exportedSymbols[symbolName] as any)[0]);
        }
    }
    return exportIds;
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
    const compilation = new SolidityCompletionItemProvider();
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('solidity', compilation, '.'));
}

export function deactivate() {
}