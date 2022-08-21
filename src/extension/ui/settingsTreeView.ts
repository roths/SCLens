
import * as path from 'path';
import * as vscode from 'vscode';
import { solcHttpClient } from '../../common/solcCompiler';
import { userContext } from '../../common/userContext';

export class SettingsTreeViewProvider implements vscode.TreeDataProvider<SettingsItem> {
    // vscode extension contributes.views id
    public static readonly viewId = "scLens.settingsTree";

    private _onDidChangeTreeData: vscode.EventEmitter<SettingsItem | null> = new vscode.EventEmitter<SettingsItem | null>();
    public readonly onDidChangeTreeData: vscode.Event<SettingsItem | null> = this._onDidChangeTreeData.event;

    private data: SettingsItem[] = [];

    constructor(context: vscode.ExtensionContext) {
        userContext.attachAccountTreeView(this);

        // register item select command
        context.subscriptions.push(vscode.commands.registerCommand('scLens.settings',
            this.showMenu.bind(this)));
        context.subscriptions.push(vscode.commands.registerCommand('scLens.settings.addAccount',
            async (viewItem: SettingsItem) => {
                vscode.window.showInformationMessage('not implement');
            }));
    }

    public getTreeItem(element: SettingsItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    public getChildren(element?: SettingsItem | undefined): vscode.ProviderResult<SettingsItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return [];
    }

    public refresh(): void {
        this.data = [];
        const { accountAddress, pk } = userContext.getCurAccount();
        this.data.push(new SettingsItem('[Current Account]: ' + accountAddress, accountAddress, 'account'));
        const colVersion = userContext.selectedCompilerVersion;
        this.data.push(new SettingsItem('[Compiler Version]: ' + colVersion, colVersion, 'compile-version'));
        this._onDidChangeTreeData.fire(null);
    }

    private async showMenu(viewItem: SettingsItem) {
        let items = [];
        switch (viewItem.type) {
            case 'account':
                for (const key of userContext.accounts.keys()) {
                    items.push(key);
                }
                const account = await vscode.window.showQuickPick(items, {
                    placeHolder: `Select Account`
                });
                if (account) {
                    userContext.selectedAccount = account;
                    this.refresh();
                }
                break;
            case 'compile-version':
                const solcVersionMap = await solcHttpClient.fetchVersions();
                items.push('Auto');
                items.push(...Object.keys(solcVersionMap));
                const version = await vscode.window.showQuickPick(items, {
                    placeHolder: `Select Compiler Version`
                });
                if (version) {
                    userContext.selectedCompilerVersion = version;
                    this.refresh();
                }
                break;
        }
    }

    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.window.registerTreeDataProvider(SettingsTreeViewProvider.viewId,
            new SettingsTreeViewProvider(context)));
    }
}


type SettingType = 'account' | 'compile-version';

class SettingsItem extends vscode.TreeItem {
    data: string;
    type: SettingType;

    constructor(label: string, data: string, type: SettingType) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.data = data;
        this.type = type;
        this.contextValue = type;
        this.iconPath = path.join(__filename, '..', '..', '..', '..', 'asset', 'fieldset.svg');
    }
}