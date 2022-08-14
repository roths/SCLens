import Web3 from "web3";
import { CompiledContract } from "./type";
import { userContext } from "./userContext";
import { AbiItem } from 'web3-utils';

// user interaction flow
class UIFlow {

    public async deploy(web3: Web3, compiledContract: CompiledContract) {
        const bytecode = compiledContract.evm.bytecode.object;
        const abi = compiledContract.abi;
        const contract = new web3.eth.Contract(abi);
        const contractTx = contract.deploy({
            data: bytecode,
            arguments: [5],
        });
        const { accountAddress, pk } = userContext.getCurAccount();
        const deployTransaction = await web3.eth.accounts.signTransaction(
            {
                // nonce: txCount + 3,
                from: accountAddress,
                data: contractTx.encodeABI(),
                gas: 300000,
            },
            pk
        );
        const promise = web3.eth.sendSignedTransaction(deployTransaction.rawTransaction!);
        promise.on('transactionHash', function (hash) {
            console.log('transactionHash');
            console.log(hash);
            web3.eth.getTransaction(hash).then((tx) => {
                console.log('立马拉取合约信息', tx)
            })
        }).on('sent', function (sent) {
            console.log('sent');
            console.log(sent);
        }).on('error', console.error);

        const createReceipt = await promise;
        console.log('Contract createReceipt:', createReceipt);
        return createReceipt.contractAddress ?? null;
    }

	public async invoke(web3: Web3, contractAbi: AbiItem[], contractAddress: string, methodInfo: any[]) {
		const contract = new web3.eth.Contract(contractAbi, contractAddress);
		const [methodName, ...params] = methodInfo;
		const { accountAddress, pk } = userContext.getCurAccount();
		console.log(
			`Calling contract function '${methodName}' in address ${contractAddress} with params:${params.join(',')}`
		);
		const encoded = contract.methods[methodName](...params).encodeABI();
		const tx = await web3.eth.accounts.signTransaction(
			{
				from: accountAddress,
				to: contractAddress,
				data: encoded,
				gas: '3000000',
			},
			pk
		);
		const promise = web3.eth.sendSignedTransaction(tx.rawTransaction!);
		promise.on('transactionHash', function (hash) {
			console.log('transactionHash');
			console.log(hash);
            web3.eth.getTransaction(hash).then((tx) => {
                console.log('立马拉取函数调用信息', tx)
            })
		}).on('sent', function (sent) {
			console.log('sent');
			console.log(sent);
		}).on('error', console.error);
		const createReceipt = await promise;
		console.log('invoke successfull with createReceipt:', createReceipt);
		return createReceipt.transactionHash;
	}
}

export const uiFlow = new UIFlow();