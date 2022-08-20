import { SettingsTreeViewProvider } from "../extension/ui/settingsTreeView";
import { HistoryTreeViewProvider } from "../extension/ui/historyTreeView";
import path from "path";
import vscode from "vscode";
import fs from 'fs';
import { workspaceFileAccessor } from "../extension/utils/file";

class UserContext {
    public selectedCompilerVersion: string = "Auto";
    public selectedAccount: string | null = null;
    // 'https://remix-goerli.ethdevops.io'
    // 'https://ropsten.infura.io/v3/4c32d98b849c4310af378437be8128e5'
    // 'http://192.168.0.155:8545'
    public network: string = "https://remix-goerli.ethdevops.io";

    private _contractHistory: ContractHistory = {};
    public get contractHistory() {
        return this._contractHistory;
    }
    // address, private key
    private _accounts = new Map<string, string>();
    public get accounts() {
        return this._accounts;
    }
    private historyTreeViewProvider: HistoryTreeViewProvider | null = null;
    private settingsTreeViewProvider: SettingsTreeViewProvider | null = null;
    private cachePath!: string;

    public async activate(context: vscode.ExtensionContext) {
        this.cachePath = context.extensionPath;
        this.loadContextCache();
    }

    public async deactivate() {
        this.saveContextCache();
    }

    getCurAccount(): { accountAddress: string, pk: string; } {
        if (this.selectedAccount) {
            return { accountAddress: this.selectedAccount, pk: this.accounts.get(this.selectedAccount) ?? "" };
        }
        const curAccount = this.accounts.entries().next().value;
        return { accountAddress: curAccount[0], pk: curAccount[1] };
    }

    addAccount(address: string, pk: string) {
        this.accounts.set(address, pk);
        this.settingsTreeViewProvider?.refresh();
    }

    findContractHistory(filePath: string, contractName: string, deployBytecode: string): string | null {
        let contractAddress: string | null = null;
        for (const address in this.contractHistory) {
            const cacheItem = this.contractHistory[address];
            if (cacheItem.filePath === filePath
                && cacheItem.deployBytecode === deployBytecode
                && cacheItem.contractName === contractName) {
                contractAddress = address;
                break;
            }
        }
        return contractAddress;

    }

    addContractHisory(filePath: string, contractName: string, deployBytecode: string, address: string) {
        this.contractHistory[address] = {
            filePath,
            deployBytecode: deployBytecode,
            contractName,
            txHistory: []
        };
        this.historyTreeViewProvider?.refresh(this.contractHistory);
    }

    addTxHistory(contractAddress: string, txHash: string, desc: string) {
        if (this.contractHistory[contractAddress]) {
            this.contractHistory[contractAddress].txHistory.push({ txHash, desc });

        }
        this.historyTreeViewProvider?.refresh(this.contractHistory);
    }

    attachHistoryTreeView(provider: HistoryTreeViewProvider) {
        this.historyTreeViewProvider = provider;
        this.historyTreeViewProvider.refresh(this.contractHistory);
    }

    attachAccountTreeView(provider: SettingsTreeViewProvider) {
        this.settingsTreeViewProvider = provider;
        this.settingsTreeViewProvider.refresh();
    }

    private async saveContextCache() {
        const cacheFile = this.getCacheFile();
        await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });


        await workspaceFileAccessor.writeFile(cacheFile, new TextEncoder().encode(JSON.stringify({
            selectedCompilerVersion: this.selectedCompilerVersion,
            selectedAccount: this.selectedAccount,
            contractHistory: this._contractHistory,
            accounts: this._accounts,
        })));
    }

    private async loadContextCache() {
        this.injectTestData();

        const cacheFile = this.getCacheFile();
        if (!fs.existsSync(cacheFile)) {
            return;
        }

        const cache = JSON.parse(new TextDecoder().decode(await workspaceFileAccessor.readFile(cacheFile)));

        if (cache) {
            if (cache.selectedCompilerVersion) {
                this.selectedCompilerVersion = cache.selectedCompilerVersion;
            }
            if (cache.selectedAccount) {
                this.selectedAccount = cache.selectedAccount;
            }
            if (cache.contractHistory) {
                this._contractHistory = cache.contractHistory;
            }
            if (cache.accounts) {
                this._accounts = cache.accounts;
            }
        }
    }

    private getCacheFile() {
        return path.join(this.cachePath, "cache", "user", "context.json");
    }

    private injectTestData() {
        this.addContractHisory('/Users/luoqiaoyou/Downloads/sol/test.sol', 'Storage', '608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b6040516100509190610139565b60405180910390f35b610073600480360381019061006e9190610185565b61007e565b005b60008054905090565b6000600190505b600a81116100af5760018261009a91906101e1565b915080806100a790610215565b915050610085565b506100b9816100d9565b600b826100c6919061025d565b6100d091906101e1565b60008190555050565b600080600190505b600a811161010b576001836100f691906101e1565b9250808061010390610215565b9150506100e1565b50600a8261011991906101e1565b9050919050565b6000819050919050565b61013381610120565b82525050565b600060208201905061014e600083018461012a565b92915050565b600080fd5b61016281610120565b811461016d57600080fd5b50565b60008135905061017f81610159565b92915050565b60006020828403121561019b5761019a610154565b5b60006101a984828501610170565b91505092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60006101ec82610120565b91506101f783610120565b925082820190508082111561020f5761020e6101b2565b5b92915050565b600061022082610120565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203610252576102516101b2565b5b600182019050919050565b600061026882610120565b915061027383610120565b925082820390508181111561028b5761028a6101b2565b5b9291505056fea2646970667358221220bede6d26580ced854ce567319fe70f325bcf41257ec66abaea1e864b7f413d7d64736f6c63430008100033', '0x679d5ff726A632A2cFf91Cf0851427ADb9770bfc');
        this.addTxHistory('0x679d5ff726A632A2cFf91Cf0851427ADb9770bfc', '0x4527273fdc790723e849222eee45a806b36833ffe26451929c2beab357bc88d4', 'store(111)');
        this.addAccount('0x957605948208a014D92F8968268053a4E4E14A0D', 'f7ad2ba6fd69c9ee0ce6119a3fd563f0ce6a58901f8265faa1bed3362ac919c2');
        this.addAccount('0x03E397A7b9f24AdDb07d03176599970a942497ef', '2f4e33cb48b192c96ada5c190d760bebb1950a9bcb436c42ae4413c077cae48c');
    }
}

// feature list:
// build history tree view
//   - contract address
//     - [desc] txHash
// 
export interface ContractHistory {
    [contractAddress: string]: {
        filePath: string;
        deployBytecode: string;
        contractName: string;
        txHistory: {
            txHash: string;
            // describe format: function name + params
            desc: string;
        }[];
    };
}
// single instance
export const userContext = new UserContext();