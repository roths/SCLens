

import { EthDebugger, TransactionDebugger, BreakpointManager, init } from '@remix-project/remix-debug';

import Web3 from 'web3';
import { SolcCompiler } from './common/solcCompiler';
import { Transaction } from '@ethereumjs/tx';
import { Buffer } from 'buffer';
import { TraceTransaction } from './common/type';
import { TraceCache } from './trace/TraceCache';
import { TraceManager } from './trace/traceManager';
import { InternalCallTree, SolidityProxy } from './solidity-decoder';
import { BlockChainInstruction, CodeManager } from './code/codeManager';


var _from = '0x957605948208a014D92F8968268053a4E4E14A0D';
var _from_pk = 'f7ad2ba6fd69c9ee0ce6119a3fd563f0ce6a58901f8265faa1bed3362ac919c2';
var _to = '0';
// const web3 = new Web3('https://ropsten.infura.io/v3/4c32d98b849c4310af378437be8128e5')
const web3 = new Web3('https://remix-ropsten.ethdevops.io');

init.extend(web3);


export async function debug() {

    const result = await compileAll();

    // 0x36d06975ebe296b92fc5eabf0bbbcf96365a8eeb52ab9dcf3ea87a330b8e77ef 这是retrieve
    const txHash = "0x032a84ded19932f05c3536690bcbc5c17cbd05e3790c7c0ae67a33a92d4987c1";//已经部署了
    const contractAddress = "0x2C2e48ced723b0Ae82245d27Cc7914A27f682E84";//已经部署了
    const tx = await web3.eth.getTransaction(txHash);
    console.log(tx);

    const traceManager = new TraceManager(web3);
    await traceManager.resolveTrace(tx);

    // getCode from web3
    const codeManager = new CodeManager(web3, traceManager);

    console.log(traceManager);

    const solidityProxy = new SolidityProxy({
        getCurrentCalledAddressAt: traceManager.getCurrentCalledAddressAt.bind(traceManager), getCode: () => {
            return result.contracts!["/Users/luoqiaoyou/Downloads/sol/test.sol"]["Storage"].evm;
        }
    });
    solidityProxy.reset(result);
    const internalCallTree = new InternalCallTree(traceManager, solidityProxy, codeManager);
    internalCallTree.newTraceLoaded();
}


export async function deploy() {
    // const web3 = new Web3('https://ropsten.etherscan.io/')
    const balance = await web3.eth.getBalance(_from);
    console.log("balance:" + balance);

    const compiledContract = await compile();
    const bytecode = compiledContract.evm.bytecode.object;
    const abi = compiledContract.abi;
    const contract = new web3.eth.Contract(abi as any);
    const contractTx = contract.deploy({
        data: bytecode,
        arguments: [5],
    });
    const deployTransaction = await web3.eth.accounts.signTransaction(
        {
            from: _from,
            data: contractTx.encodeABI(),
            gas: '3000000',
        },
        _from_pk
    );
    const createReceipt = await web3.eth.sendSignedTransaction(deployTransaction.rawTransaction!);
    console.log('Contract createReceipt:', createReceipt);
    console.log('Contract deployed at address:', createReceipt.contractAddress);
}

async function compile(path: string = "/Users/luoqiaoyou/vscode/helloworld/",
    file: string = "/Users/luoqiaoyou/Downloads/sol/test.sol",
    contractName: string = "Storage") {
    const solc = new SolcCompiler(path);
    const compilationResult = await solc.compile(file);
    return compilationResult.contracts![file][contractName];
}

async function compileAll(path: string = "/Users/luoqiaoyou/vscode/helloworld/",
    file: string = "/Users/luoqiaoyou/Downloads/sol/test.sol") {
    const solc = new SolcCompiler(path);
    const compilationResult = await solc.compile(file);
    return compilationResult;
}

export async function invoke(contractAddress: string = "0x2C2e48ced723b0Ae82245d27Cc7914A27f682E84") {
    const compiledContract = await compile();

    const storage = new web3.eth.Contract(compiledContract.abi as any, contractAddress);
    const _value = 100;
    let encoded = storage.methods.store(_value).encodeABI();
    console.log(
        `Calling the Storage store function by ${_value} in contract at address ${contractAddress}`
    );
    let createTransaction = await web3.eth.accounts.signTransaction(
        {
            from: _from,
            to: contractAddress,
            data: encoded,
            gas: '3000000',
        },
        _from_pk
    );
    let createReceipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction!);
    console.log('Tx successfull with createReceipt:', createReceipt);


    console.log(
        `Calling the Storage retrieve function in contract at address ${contractAddress}`
    );
    encoded = storage.methods.retrieve().encodeABI();

    createTransaction = await web3.eth.accounts.signTransaction(
        {
            from: _from,
            to: contractAddress,
            data: encoded,
            gas: '3000000',
        },
        _from_pk
    );
    createReceipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction!);
    console.log('Tx successfull with createReceipt:', createReceipt);

    console.log(await storage.methods.retrieve().call());

}

