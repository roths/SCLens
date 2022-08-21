
import * as vscode from 'vscode';
import { ContractHistory, userContext } from '../../common/userContext';
import * as fs from 'fs';

export class HistoryTreeViewProvider implements vscode.TreeDataProvider<HistoryItem> {
    // vscode extension contributes.views id
    static viewId = "scLens.deployHistoryTree";

    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | null> = new vscode.EventEmitter<HistoryItem | null>();

    readonly onDidChangeTreeData: vscode.Event<HistoryItem | null> = this
        ._onDidChangeTreeData.event;

    private data: HistoryItem[] = [];

    constructor(context: vscode.ExtensionContext) {
        userContext.attachHistoryTreeView(this);

        // register item commands
        context.subscriptions.push(vscode.commands.registerCommand('scLens.deployHistory.copyContractAddress',
            async (viewItem: HistoryItem) => {
                vscode.env.clipboard.writeText(viewItem.data);
                vscode.window.showInformationMessage('Contract Address Copied:' + viewItem.data);
            }));
        context.subscriptions.push(vscode.commands.registerCommand('scLens.deployHistory.debugContract',
            async (viewItem: HistoryItem) => {
                const contractAddress = viewItem.data;
                const contractHistory = userContext.contractHistory[contractAddress];
                const fileStat = await fs.promises.stat(contractHistory.filePath);
                if (!fileStat || !fileStat.isFile()) {
                    vscode.window.showErrorMessage(`Contract source file not exist: ${contractHistory.filePath}`);
                    return;
                }
                vscode.debug.startDebugging(undefined, {
                    "type": "solidity",
                    "request": "launch",
                    "name": "Debug Contract",
                    "solidity": {
                        contractAddress
                    },
                    "program": contractHistory.filePath
                });
            }));
        context.subscriptions.push(vscode.commands.registerCommand('scLens.deployHistory.copyTxHash',
            async (viewItem: HistoryItem) => {
                vscode.env.clipboard.writeText(viewItem.data);
                vscode.window.showInformationMessage('Transaction Hash Copied:' + viewItem.data);
            }));
        context.subscriptions.push(vscode.commands.registerCommand('scLens.deployHistory.debugTransaction',
            async (viewItem: HistoryItem) => {
                const contractViewItem = viewItem.parent!;
                const programFile = userContext.contractHistory[contractViewItem.data].filePath;
                const fileStat = await fs.promises.stat(programFile);
                if (!fileStat || !fileStat.isFile()) {
                    vscode.window.showErrorMessage(`Contract source file not exist: ${programFile}`);
                    return;
                }
                vscode.debug.startDebugging(undefined, {
                    "type": "solidity",
                    "request": "launch",
                    "name": "Debug Transaction",
                    "solidity": {
                        contractAddress: contractViewItem.data,
                        transactionHash: viewItem.data
                    },
                    "program": programFile
                });
            }));
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: HistoryItem | undefined): vscode.ProviderResult<HistoryItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }

    refresh(contractHistory: ContractHistory): void {
        this.data = [];
        for (const address in contractHistory) {
            const cache = contractHistory[address];
            const children: HistoryItem[] = [];
            cache.txHistory.forEach(item => children.push(new HistoryItem(`${item.desc} with hash ${this.formatHash(item.txHash)}`, item.txHash, "transaction", [])));
            this.data.push(new HistoryItem(`${cache.contractName} at ${this.formatHash(address)}`, address, "contract", children));
        }
        this._onDidChangeTreeData.fire(null);
    }

    private formatHash(hash: string) {
        return hash.slice(0, 8) + '...';
    }

    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.window.registerTreeDataProvider(HistoryTreeViewProvider.viewId,
            new HistoryTreeViewProvider(context)));
    }
}

class HistoryItem extends vscode.TreeItem {
    parent: HistoryItem | null = null;
    children: HistoryItem[];
    data: string;

    constructor(label: string, data: string, type: "contract" | "transaction", children: HistoryItem[]) {
        super(
            label,
            children.length === 0 ? vscode.TreeItemCollapsibleState.None :
                vscode.TreeItemCollapsibleState.Expanded);
        this.children = children;
        this.data = data;
        if (this.children) {
            // set parent
            this.children.forEach((value) => value.parent = this);
        }
        this.contextValue = type;
        if (this.contextValue === 'contract') {
            // this.iconPath = iconPath
        }
    }
}