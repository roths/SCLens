
export class UserContext {
    selectedCompilerVersion: string = "recommend";
    network: string = "https://remix-ropsten.ethdevops.io";
    // address, private key
    private account = new Map<string, string>([
        // test data
        ['0x957605948208a014D92F8968268053a4E4E14A0D', 'f7ad2ba6fd69c9ee0ce6119a3fd563f0ce6a58901f8265faa1bed3362ac919c2'],
        ['0x03E397A7b9f24AdDb07d03176599970a942497ef', '2f4e33cb48b192c96ada5c190d760bebb1950a9bcb436c42ae4413c077cae48c'],
    ]);

    // fileName: contractName : bytecode : deploy address 
    private deployHistory: { [fileName: string]: { [contractName: string]: { [bytecode: string]: string; }; }; } = {};
    // contractAddress: encoded data : tx hash
    private txHistory: { [contractAddress: string]: { [encodedData: string]: string; }; } = {};

    getAccount(): { accountAddress: string, pk: string; } {
        const curAccount = this.account.entries().next().value;
        return { accountAddress: curAccount[0], pk: curAccount[1] };
    }

    findDeployHistory(fileName: string, contractName: string, bytecode: string): string | null {
        this.injectTestData();
        let contractAddress: string | null = null;
        if (this.deployHistory[fileName]
            && this.deployHistory[fileName][contractName]
            && this.deployHistory[fileName][contractName][bytecode]) {
            contractAddress = this.deployHistory[fileName][contractName][bytecode];
        }
        return contractAddress;
    }

    addDeployHisory(fileName: string, contractName: string, bytecode: string, address: string) {
        this.deployHistory[fileName] = this.deployHistory[fileName] || {};
        this.deployHistory[fileName][contractName] = this.deployHistory[fileName][contractName] || {};
        this.deployHistory[fileName][contractName][bytecode] = address;
    }

    findTxHistory(contractAddress: string, encodedData: string): string | null {
        this.injectTestData();
        let txHash: string | null = null;
        if (this.txHistory[contractAddress]
            && this.txHistory[contractAddress][encodedData]) {
                txHash = this.txHistory[contractAddress][encodedData];
        }
        return txHash;
    }

    addTxHistory(contractAddress: string, encodedData: string, txHash: string) {
        this.txHistory[contractAddress] = this.txHistory[contractAddress] || {};
        this.txHistory[contractAddress][encodedData] = txHash;
    }

    private injectTestData() {
        this.addDeployHisory('/Users/luoqiaoyou/Downloads/sol/test.sol', 'Storage', '6080604052348015600f57600080fd5b506004361060325760003560e01c80632e64cec11460375780636057361d14604c575b600080fd5b60005460405190815260200160405180910390f35b605b60573660046091565b605d565b005b60015b600a8111608157607060018360bf565b915080607a8160d4565b9150506060565b50608b600b8260ea565b60005550565b60006020828403121560a257600080fd5b5035919050565b634e487b7160e01b600052601160045260246000fd5b6000821982111560cf5760cf60a9565b500190565b60006001820160e35760e360a9565b5060010190565b60008282101560f95760f960a9565b50039056fea26469706673582212204383f31afdf2260874713569240ab60255aca3ec03a3d7e449881a6b62100ed464736f6c634300080f0033', '0x1EB581b579f3841718f6FbD9020DaFB4b63d2497');
        this.addTxHistory('0x1EB581b579f3841718f6FbD9020DaFB4b63d2497', '0x6057361d0000000000000000000000000000000000000000000000000000000000000064', '0x55255dadc310e3dab26e568014589bcb9c6ccae6fe0d77cbc01f57c3c24f3af7');
    }
}