
import * as vscode from 'vscode';

export class InstructionListViewProvider implements vscode.TreeDataProvider<InstructionItem> {
    // vscode extension contributes.views id
    public static readonly viewId = "scLens.instructionTree";
    private static readonly refreshEvent = 'scLens.instruction.list.refresh';
    private static readonly selectEvent = 'scLens.instruction.list.select';
    protected treeView!: vscode.TreeView<InstructionItem>;

    private _onDidChangeTreeData: vscode.EventEmitter<InstructionItem | null> = new vscode.EventEmitter<InstructionItem | null>();

    readonly onDidChangeTreeData: vscode.Event<InstructionItem | null> = this
        ._onDidChangeTreeData.event;

    private data: InstructionItem[] = [];

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(InstructionListViewProvider.refreshEvent, this.refresh.bind(this)));
        context.subscriptions.push(vscode.commands.registerCommand(InstructionListViewProvider.selectEvent, this.select.bind(this)));
    }

    public getTreeItem(element: InstructionItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    public getChildren(element?: InstructionItem | undefined): vscode.ProviderResult<InstructionItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return [];
    }

    public getParent(element: InstructionItem): vscode.ProviderResult<InstructionItem> {
        return null;
    }

    private refresh(instructionList: string[]): void {
        this.data = [];
        instructionList.forEach((value: string) => {
            this.data.push(new InstructionItem(value, value));
        });
        this._onDidChangeTreeData.fire(null);
    }

    private select(index: number) {
        this.treeView.reveal(this.data[index]);
    }

    public static triggerRefresh(instructionList: string[]) {
        vscode.commands.executeCommand(InstructionListViewProvider.refreshEvent, instructionList);
    }

    public static triggerSelect(index: number) {
        vscode.commands.executeCommand(InstructionListViewProvider.selectEvent, index);
    }

    public static register(context: vscode.ExtensionContext) {
        const provider = new InstructionListViewProvider(context);
        const treeView = vscode.window.createTreeView(InstructionListViewProvider.viewId, {
            treeDataProvider: provider
        });
        // inject treeview
        provider.treeView = treeView;
        context.subscriptions.push(treeView);
    }
}

class InstructionItem extends vscode.TreeItem {
    data: string;

    constructor(label: string, data: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.data = data;
    }
}