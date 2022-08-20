import { AccountTreeViewDataProvider } from "../client/accountTreeView";
import { HistoryTreeViewDataProvider } from "../client/historyTreeView";

class UserContext {
    selectedCompilerVersion: string = "Auto";
    selectedAccount: string | null = null;
    // 'https://remix-goerli.ethdevops.io'
    // 'https://ropsten.infura.io/v3/4c32d98b849c4310af378437be8128e5'
    // 'http://192.168.0.155:8545'
    network: string = "https://remix-goerli.ethdevops.io";

    readonly contractHistory: ContractHistory = {};

    // address, private key
    readonly accounts = new Map<string, string>();
    // test, contractName，address，txhash

    private historyTreeViewProvider: HistoryTreeViewDataProvider | null = null;
    private accountTreeViewProvider: AccountTreeViewDataProvider | null = null;

    constructor() {
        this.injectTestData();
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
        this.accountTreeViewProvider?.refresh();
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

    attachHistoryTreeView(provider: HistoryTreeViewDataProvider) {
        this.historyTreeViewProvider = provider;
        // test
        this.injectTestData();
    }

    attachAccountTreeView(provider: AccountTreeViewDataProvider) {
        this.accountTreeViewProvider = provider;
        // test
        this.injectTestData();
    }

    private injectTestData() {
        this.addContractHisory('/Users/luoqiaoyou/Downloads/sol/test.sol', 'Storage', '608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610050575b600080fd5b60005460405190815260200160405180910390f35b61006361005e3660046100f2565b610065565b005b60015b600a811161008f5761007b600183610121565b91508061008781610134565b915050610068565b50610099816100b4565b6100a4600b8361014d565b6100ae9190610121565b60005550565b600060015b600a81116100e0576100cc600184610121565b9250806100d881610134565b9150506100b9565b506100ec82600a610121565b92915050565b60006020828403121561010457600080fd5b5035919050565b634e487b7160e01b600052601160045260246000fd5b808201808211156100ec576100ec61010b565b6000600182016101465761014661010b565b5060010190565b818103818111156100ec576100ec61010b56fea264697066735822122031b278e124b283f039170d35d7bd502dff50f516383e0699a642e68c87e2d8c664736f6c63430008100033', '0xC97a87Af9D9d27df86DA78b605e00730Cf2CDb3d');
        this.addTxHistory('0xC97a87Af9D9d27df86DA78b605e00730Cf2CDb3d', '0x5884fe1b70ed440199bf388e2a7bf1bffa09cc3e74095e4df644ce2716e9bb83', 'store(111)');
        this.addContractHisory('/Users/luoqiaoyou/Downloads/sol/test.sol', 'Storage', '608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610050575b600080fd5b60005460405190815260200160405180910390f35b61006361005e3660046100f2565b610065565b005b60015b600a811161008f5761007b600183610121565b91508061008781610139565b915050610068565b50610099816100b4565b6100a4600b83610152565b6100ae9190610121565b60005550565b600060015b600a81116100e0576100cc600184610121565b9250806100d881610139565b9150506100b9565b506100ec82600a610121565b92915050565b60006020828403121561010457600080fd5b5035919050565b634e487b7160e01b600052601160045260246000fd5b600082198211156101345761013461010b565b500190565b60006001820161014b5761014b61010b565b5060010190565b6000828210156101645761016461010b565b50039056fea2646970667358221220edceccd7d3a239d2106b50e75da22efc18442697c3ff01224c12752290bda7cf64736f6c634300080f0033', '0xeC67ECe25aC64Fb6E8b1883956D4CC2f2D89365F');
        this.addTxHistory('0xeC67ECe25aC64Fb6E8b1883956D4CC2f2D89365F', '0x1c6ec97ed7cb6c3e7a366485bf3c2e9682cd03be65c0cdd09dc011987db71177', 'store(100)');
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