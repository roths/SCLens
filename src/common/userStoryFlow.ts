import Web3 from "web3";
import { CompiledContract } from "./type";
import { userContext } from "./userContext";
import { AbiItem } from 'web3-utils';

// user interaction flow
class UserStoryFlow {

    public async deploy(web3: Web3, compiledContract: CompiledContract) {
        const bytecode = compiledContract.evm.bytecode.object;
        const abi = compiledContract.abi;
        const contract = new web3.eth.Contract(abi);
        const { accountAddress, pk } = userContext.getCurAccount();
        const contractInstance = await contract.deploy({
            data: bytecode,
            arguments: [5],
        }).send({ from: accountAddress, gas: 300000 });

        console.log('Create contract instance:', contractInstance);
        return contractInstance.options.address ?? null;
    }

    public async invoke(web3: Web3, contractAbi: AbiItem[], contractAddress: string, methodInfo: any[]) {
        const contractInstance = new web3.eth.Contract(contractAbi, contractAddress);
        const [methodName, ...params] = methodInfo;
        const { accountAddress, pk } = userContext.getCurAccount();
        console.log(
            `Calling contract function '${methodName}' in address ${contractAddress} with params:${params.join(',')}`
        );

        const createReceipt = await contractInstance.methods[methodName](...params).send({ from: accountAddress, gas: 300000 });
        console.log('invoke successfull with createReceipt:', createReceipt);
        return createReceipt.transactionHash;
    }
}

export const uiFlow = new UserStoryFlow();