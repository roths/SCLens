import { SettingsTreeViewProvider } from "../extension/ui/settingsTreeView";
import { HistoryTreeViewProvider } from "../extension/ui/historyTreeView";
import path from "path";
import vscode from "vscode";
import fs from 'fs';
import Web3 from "web3";
import { extend } from '../solidity/init';
import { extend as extendSimulator, Provider } from "@remix-project/remix-simulator";
import { getText, writeText } from "./utils/file";

enum Web3Type {
    VM,
    Block
}
class UserContext {
    public selectedCompilerVersion: string = "Auto";
    public selectedAccount: string | null = null;
    // 'https://remix-goerli.ethdevops.io'
    // 'https://ropsten.infura.io/v3/4c32d98b849c4310af378437be8128e5'
    // 'http://192.168.0.155:8545'
    public network: string = "https://remix-goerli.ethdevops.io";
    public web3Type = Web3Type.VM;

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

    public getWeb3Provider() {
        let web3: Web3;
        if (this.web3Type === Web3Type.VM) {
            const remixSimulatorProvider = new Provider({ fork: 'london' });
            remixSimulatorProvider.init();
            web3 = new Web3(remixSimulatorProvider);
            extendSimulator(web3);

            remixSimulatorProvider.Accounts._addAccount('503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb', '0x56BC75E2D63100000');
            remixSimulatorProvider.Accounts._addAccount('7e5bfb82febc4c2c8529167104271ceec190eafdca277314912eaabdb67c6e5f', '0x56BC75E2D63100000');
            remixSimulatorProvider.Accounts._addAccount('cc6d63f85de8fef05446ebdd3c537c72152d0fc437fd7aa62b3019b79bd1fdd4', '0x56BC75E2D63100000');
            remixSimulatorProvider.Accounts._addAccount('638b5c6c8c5903b15f0d3bf5d3f175c64e6e98a10bdb9768a2003bf773dcb86a', '0x56BC75E2D63100000');
            remixSimulatorProvider.Accounts._addAccount('f49bf239b6e554fdd08694fde6c67dac4d01c04e0dda5ee11abee478983f3bc0', '0x56BC75E2D63100000');
            remixSimulatorProvider.Accounts._addAccount('adeee250542d3790253046eee928d8058fd544294a5219bea152d1badbada395', '0x56BC75E2D63100000');
        } else {
            web3 = new Web3(userContext.network);
            extend(web3);
            web3.eth.accounts.wallet.add('f7ad2ba6fd69c9ee0ce6119a3fd563f0ce6a58901f8265faa1bed3362ac919c2');
            web3.eth.accounts.wallet.add('2f4e33cb48b192c96ada5c190d760bebb1950a9bcb436c42ae4413c077cae48c');
        }

        return web3!;
    }

    public getCurAccount(): { accountAddress: string, pk: string; } {
        if (this.selectedAccount) {
            return { accountAddress: this.selectedAccount, pk: this.accounts.get(this.selectedAccount) ?? "" };
        }
        const curAccount = this.accounts.entries().next().value;
        return { accountAddress: curAccount[0], pk: curAccount[1] };
    }

    public addAccount(address: string, pk: string) {
        this.accounts.set(address, pk);
        this.settingsTreeViewProvider?.refresh();
    }

    public findContractHistory(filePath: string, contractName: string, deployBytecode: string): string | null {
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

    public addContractHisory(filePath: string, contractName: string, deployBytecode: string, address: string) {
        if (!this.cacheable()) {
            return;
        }
        this.contractHistory[address] = {
            filePath,
            deployBytecode: deployBytecode,
            contractName,
            txHistory: []
        };
        this.historyTreeViewProvider?.refresh(this.contractHistory);
    }

    public addTxHistory(contractAddress: string, txHash: string, desc: string) {
        if (!this.cacheable()) {
            return;
        }
        if (this.contractHistory[contractAddress]) {
            this.contractHistory[contractAddress].txHistory.push({ txHash, desc });

        }
        this.historyTreeViewProvider?.refresh(this.contractHistory);
    }

    public attachHistoryTreeView(provider: HistoryTreeViewProvider) {
        this.historyTreeViewProvider = provider;
        this.historyTreeViewProvider.refresh(this.contractHistory);
    }

    public attachAccountTreeView(provider: SettingsTreeViewProvider) {
        this.settingsTreeViewProvider = provider;
        this.settingsTreeViewProvider.refresh();
    }

    private cacheable() {
        return this.web3Type === Web3Type.Block;
    }

    private async saveContextCache() {
        await writeText(this.getCacheFile(), JSON.stringify({
            selectedCompilerVersion: this.selectedCompilerVersion,
            selectedAccount: this.selectedAccount,
            contractHistory: this._contractHistory,
            accounts: this._accounts,
        }));
    }

    private async loadContextCache() {
        this.injectTestData();

        const cacheFile = this.getCacheFile();
        if (!fs.existsSync(cacheFile)) {
            return;
        }

        const cache = JSON.parse(await getText(cacheFile));

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
        if (this.web3Type === Web3Type.Block) {
            this.addContractHisory('/Users/luoqiaoyou/Downloads/sol/test.sol', 'Storage', '608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b6040516100509190610139565b60405180910390f35b610073600480360381019061006e9190610185565b61007e565b005b60008054905090565b6000600190505b600a81116100af5760018261009a91906101e1565b915080806100a790610215565b915050610085565b506100b9816100d9565b600b826100c6919061025d565b6100d091906101e1565b60008190555050565b600080600190505b600a811161010b576001836100f691906101e1565b9250808061010390610215565b9150506100e1565b50600a8261011991906101e1565b9050919050565b6000819050919050565b61013381610120565b82525050565b600060208201905061014e600083018461012a565b92915050565b600080fd5b61016281610120565b811461016d57600080fd5b50565b60008135905061017f81610159565b92915050565b60006020828403121561019b5761019a610154565b5b60006101a984828501610170565b91505092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60006101ec82610120565b91506101f783610120565b925082820190508082111561020f5761020e6101b2565b5b92915050565b600061022082610120565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203610252576102516101b2565b5b600182019050919050565b600061026882610120565b915061027383610120565b925082820390508181111561028b5761028a6101b2565b5b9291505056fea2646970667358221220bede6d26580ced854ce567319fe70f325bcf41257ec66abaea1e864b7f413d7d64736f6c63430008100033', '0x679d5ff726A632A2cFf91Cf0851427ADb9770bfc');
            this.addTxHistory('0x679d5ff726A632A2cFf91Cf0851427ADb9770bfc', '0x4527273fdc790723e849222eee45a806b36833ffe26451929c2beab357bc88d4', 'store(111)');
            this.addAccount('0x957605948208a014D92F8968268053a4E4E14A0D', 'f7ad2ba6fd69c9ee0ce6119a3fd563f0ce6a58901f8265faa1bed3362ac919c2');
            this.addAccount('0x03E397A7b9f24AdDb07d03176599970a942497ef', '2f4e33cb48b192c96ada5c190d760bebb1950a9bcb436c42ae4413c077cae48c');
        }
        if (this.web3Type === Web3Type.VM) {
            this.addAccount('0x5B38Da6a701c568545dCfcB03FcB875f56beddC4', '503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb');
            this.addAccount('0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2', '7e5bfb82febc4c2c8529167104271ceec190eafdca277314912eaabdb67c6e5f');
            this.addAccount('0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db', 'cc6d63f85de8fef05446ebdd3c537c72152d0fc437fd7aa62b3019b79bd1fdd4');
            this.addAccount('0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB', '638b5c6c8c5903b15f0d3bf5d3f175c64e6e98a10bdb9768a2003bf773dcb86a');
            this.addAccount('0x617F2E2fD72FD9D5503197092aC168c91465E7f2', 'f49bf239b6e554fdd08694fde6c67dac4d01c04e0dda5ee11abee478983f3bc0');
            this.addAccount('0x17F6AD8Ef982297579C203069C1DbfFE4348c372', 'adeee250542d3790253046eee928d8058fd544294a5219bea152d1badbada395');
            this.addAccount('0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678', '097ffe12069dcb3c3d99e6771e2cbf491a9b8b2f93ff4d3468f550c5e8264755');
            this.addAccount('0x03C6FcED478cBbC9a4FAB34eF9f40767739D1Ff7', '5f58e8b9f1867ef00578b6f03e159428ab168f776aa445bc3ecdb02c7db8e865');
            this.addAccount('0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C', '290e721ac87c7b3f31bef7b70104b9280ed3fa1425a59451490c9c02bf50d08f');
            this.addAccount('0x0A098Eda01Ce92ff4A4CCb7A4fFFb5A43EBC70DC', '27efe944ff128cf510ab447b529eec28772f13bf65ebf1cbd504192c4f26e9d8');
            this.addAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c', '3cd7232cd6f3fc66a57a6bedc1a8ed6c228fff0a327e169c2bcc5e869ed49511');
            this.addAccount('0x14723A09ACff6D2A60DcdF7aA4AFf308FDDC160C', '2ac6c190b09897cd8987869cc7b918cfea07ee82038d492abce033c75c1b1d0c');
            this.addAccount('0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB', 'dae9801649ba2d95a21e688b56f77905e5667c44ce868ec83f82e838712a2c7a');
            this.addAccount('0x583031D1113aD414F02576BD6afaBfb302140225', 'd74aa6d18aa79a05f3473dd030a97d3305737cbc8337d940344345c1f6b72eea');
            this.addAccount('0xdD870fA1b7C4700F2BD7f44238821C26f7392148', '71975fbf7fe448e004ac7ae54cad0a383c3906055a65468714156a07385e96ce');
        }
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