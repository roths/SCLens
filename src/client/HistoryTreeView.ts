
import * as vscode from 'vscode';
import { ContractHistory, userContext } from '../common/userContext';

export class HistoryTreeViewDataProvider implements vscode.TreeDataProvider<HistoryItem> {
    // vscode extension contributes.views id
    static viewId = "deployHistory";

    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | null> = new vscode.EventEmitter<HistoryItem | null>();

    readonly onDidChangeTreeData: vscode.Event<HistoryItem | null> = this
        ._onDidChangeTreeData.event;

    private data: HistoryItem[] = [];

    constructor() {
        userContext.attachHistoryTreeView(this);
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
}

export class HistoryItem extends vscode.TreeItem {
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