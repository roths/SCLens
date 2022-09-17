import * as vscode from 'vscode';
import { SolcCompiler } from '../../solidity/compiler/solcCompiler';
import { userContext } from '../../common/userContext';
import { AstNode, AstNodeType, CompilationResult, UserDefinedTypeNameAstNode, VariableDeclarationAstNode } from '../../solidity/type';
import { AstWalker } from '../../solidity/compiler/astWalker';

class SolidityDefinitionProvider implements vscode.DefinitionProvider {

    private astNodeMap = new Map<number, AstNode>();
    private refNodeMap = new Map<number, AstNode[]>();
    private scopeNodeMap = new Map<number, AstNode[]>();
    private globalNodeIds = new Set<number>();
    private solc: SolcCompiler;
    private lastCompilationResult?: CompilationResult;
    private fileMap = new Map<number, string>();

    constructor(context: vscode.ExtensionContext) {
        this.solc = new SolcCompiler(context.extensionPath);
    }

    public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
        if (!this.lastCompilationResult) {
            return [];
        }

        const cursorOffset = document.offsetAt(position);
        const links: vscode.Location[] = [];
        const [cursorAstNode, scopeChain] = getCursorAstNodeAndScopeChain(cursorOffset, this.lastCompilationResult.sources![document.fileName].ast, this.fileMap);
        if (!cursorAstNode) {
            return links;
        }

        if (cursorAstNode.referencedDeclaration) {
            // find defination
            let targetSrc: string;
            if (cursorAstNode.nameLocations) {
                const [targetOffset, targetLen, targetFileId] = getTargetSymbolSrc(cursorAstNode.nameLocations, cursorOffset).split(':').map((value: string) => parseInt(value));
                const targetSymbolName = document.getText(new vscode.Range(document.positionAt(targetOffset),
                    document.positionAt(targetOffset + targetLen)));
                const [offset, len, fileId] = cursorAstNode.src.split(':').map((value: string) => parseInt(value));
                const callChainStr = document.getText(new vscode.Range(document.positionAt(offset), document.positionAt(offset + len)));
                let callChain = callChainStr.split('.');
                callChain = callChain.slice(0, callChain.indexOf(targetSymbolName) + 1);
                // find scope symbol
                let [targetAstNode, isInstance] = this.findAstNodeFromScope(callChain[0], scopeChain);
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
                    console.error("can not find definition astNode", callChainStr);
                    return links;
                }
                targetSrc = targetAstNode.nameLocation;
            } else {
                const definitionAstNode = this.astNodeMap.get(cursorAstNode.referencedDeclaration);
                if (!definitionAstNode) {
                    console.error('can not find referencedDeclaration', cursorAstNode.referencedDeclaration);
                    return links;
                }
                if (!definitionAstNode.nameLocation) {
                    console.error('can not nameLocation', definitionAstNode);
                    return links;
                }
                targetSrc = definitionAstNode.nameLocation;
            }

            const [offset, len, fileId] = targetSrc.split(':').map((value: string) => parseInt(value));
            const targetUri = vscode.Uri.file(this.fileMap.get(fileId)!);
            const targetDocument = await vscode.workspace.openTextDocument(targetUri);
            const range = new vscode.Range(targetDocument.positionAt(offset), targetDocument.positionAt(offset + len));
            links.push(new vscode.Location(targetUri, range));
        } else {
            // find usage
            const refs = this.refNodeMap.get(cursorAstNode.id) || [];
            for (const ref of refs) {
                const [offset, len, fileId] = ref.src.split(':').map((value: string) => parseInt(value));
                const targetUri = vscode.Uri.file(this.fileMap.get(fileId)!);
                const targetDocument = await vscode.workspace.openTextDocument(targetUri);
                const range = new vscode.Range(targetDocument.positionAt(offset), targetDocument.positionAt(offset + len));
                links.push(new vscode.Location(targetUri, range));
            }
        }

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
            const tmpRefNodeMap = new Map<number, AstNode[]>();
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
                    // save referenced ast node
                    if (node.referencedDeclaration || node.nodeType === AstNodeType.VariableDeclaration) {
                        let refId = -1;
                        if (node.referencedDeclaration) {
                            refId = node.referencedDeclaration;
                        }
                        if (node.nodeType === AstNodeType.VariableDeclaration) {
                            const varAstNode = node as VariableDeclarationAstNode;
                            if (varAstNode.typeName.nodeType === AstNodeType.UserDefinedTypeName) {
                                refId = varAstNode.typeName.referencedDeclaration;
                            }
                        }
                        if (refId !== -1) {
                            if (!tmpRefNodeMap.has(refId)) {
                                tmpRefNodeMap.set(refId, []);
                            }
                            tmpRefNodeMap.get(refId)!.push(node);
                        }
                    }
                });
            }
            // save context
            this.globalNodeIds = tmpGlobalNodeIds;
            this.scopeNodeMap = tmpScopeNodeMap;
            this.astNodeMap = tmpAstNodeMap;
            this.refNodeMap = tmpRefNodeMap;
            this.lastCompilationResult = result;
            this.fileMap = tmpFileMap;
        }
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

    private findAstNodeFromScope(invoker: string, scopeChain: number[]): [AstNode | undefined, boolean] {
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
        return [result, isInstance];
    }
}

function getTargetSymbolSrc(nameLocations: string[], cursorOffset: number) {
    let targetSrc: string | undefined;
    for (const src of nameLocations) {
        const [offset, len, fileId] = src.split(':').map((value: string) => parseInt(value));
        if (offset < cursorOffset) {
            targetSrc = src;
        } else {
            break;
        }
    }
    return targetSrc!;
}

function getCursorAstNodeAndScopeChain(cursorOffset: number, astTree: AstNode, validFileMap: Map<number, string>): [AstNode | undefined, number[]] {
    const scopeChain: number[] = [];
    let leftBound = 0;
    let rightBound = 0;
    let target: AstNode | undefined;
    new AstWalker().walkFull(astTree, (node: AstNode) => {
        const [offset, len, fileId] = node.src.split(':').map(value => parseInt(value));
        if (!validFileMap.has(fileId)) {
            return;
        }
        if (cursorOffset >= offset && cursorOffset <= offset + len) {
            scopeChain.push(node.id);
            if (offset >= leftBound || offset + len <= rightBound) {
                leftBound = offset;
                rightBound = offset + len;
                target = node;
            }
        }
    });
    return [target, scopeChain];
}

export function activate(context: vscode.ExtensionContext) {
    const definition = new SolidityDefinitionProvider(context);

    if (vscode.window.activeTextEditor) {
        definition.onEditorChange(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(vscode.languages.registerDefinitionProvider('solidity', definition));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => definition.onEditorChange(editor?.document)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => definition.onEditorChange(event.document)));
}

export function deactivate() {
}