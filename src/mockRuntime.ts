/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter } from 'events';
import { TextDecoder, TextEncoder } from 'util';
import { SolcCompiler } from './common/solcCompiler';
import * as vscode from 'vscode';
import { CompilationResult, CompiledContract } from './common/type';
import Web3 from 'web3';
import { init } from '@remix-project/remix-debug';
import { TraceManager } from './solidity/trace/traceManager';
import { CodeManager, SourceLocation } from './solidity/code/codeManager';
import { userContext } from './common/userContext';
import { multiStepInput } from './client/multiStepInput';
import { InternalCallTree, localDecoder, SolidityProxy, stateDecoder } from './solidity/solidity-decoder';
import { util } from '@remix-project/remix-lib';
import { Decorator } from './client/highlightUtil';
import { StorageViewer } from './solidity/storage/storageViewer';
import { Transaction } from 'web3-core';
import { StorageResolver } from './solidity/storage/storageResolver';
import { uiFlow } from './common/uiFlow';
export interface FileAccessor {
	readFile(path: string): Promise<Uint8Array>;
	writeFile(path: string, contents: Uint8Array): Promise<void>;
}

export interface IRuntimeBreakpoint {
	id: number;
	line: number;
	verified: boolean;
}

interface IRuntimeStepInTargets {
	id: number;
	label: string;
}

interface IRuntimeStackFrame {
	index: number;
	name: string;
	file: string;
	line: number;
	column?: number;
	instruction?: number;
}

interface IRuntimeStack {
	count: number;
	frames: IRuntimeStackFrame[];
}

interface RuntimeDisassembledInstruction {
	address: number;
	instruction: string;
	line?: number;
}

export type IRuntimeVariableType = number | boolean | string | RuntimeVariable[];

export class RuntimeVariable {
	private _memory?: Uint8Array;

	public reference?: number;

	public get value() {
		return this._value;
	}

	public set value(value: IRuntimeVariableType) {
		this._value = value;
		this._memory = undefined;
	}

	public get memory() {
		if (this._memory === undefined && typeof this._value === 'string') {
			this._memory = new TextEncoder().encode(this._value);
		}
		return this._memory;
	}

	constructor(public readonly name: string, private _value: IRuntimeVariableType) { }

	public setMemory(data: Uint8Array, offset = 0) {
		const memory = this.memory;
		if (!memory) {
			return;
		}

		memory.set(data, offset);
		this._memory = memory;
		this._value = new TextDecoder().decode(memory);
	}
}

interface Word {
	name: string;
	line: number;
	index: number;
}

export function timeout(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * A Mock runtime with minimal debugger functionality.
 * MockRuntime is a hypothetical (aka "Mock") "execution engine with debugging support":
 * it takes a Markdown (*.md) file and "executes" it by "running" through the text lines
 * and searching for "command" patterns that trigger some debugger related functionality (e.g. exceptions).
 * When it finds a command it typically emits an event.
 * The runtime can not only run through the whole file but also executes one line at a time
 * and stops on lines for which a breakpoint has been registered. This functionality is the
 * core of the "debugging support".
 * Since the MockRuntime is completely independent from VS Code or the Debug Adapter Protocol,
 * it can be viewed as a simplified representation of a real "execution engine" (e.g. node.js)
 * or debugger (e.g. gdb).
 * When implementing your own debugger extension for VS Code, you probably don't need this
 * class because you can rely on some existing debugger or runtime.
 */
export class MockRuntime extends EventEmitter {

	// the initial (and one and only) file we are 'debugging'
	private _sourceFile: string = '';
	public get sourceFile() {
		return this._sourceFile;
	}
	private set sourceFile(x) {
		this._sourceFile = this.normalizePathAndCasing(x);
	}

	private variables = new Map<string, RuntimeVariable>();

	// the contents (= lines) of the one and only file

	// This is the next line that will be 'executed'
	private currentLine = 0;
	private currentColumn = 0;

	// This is the next instruction that will be 'executed'
	private vmTraceIndex = 0;

	// maps from sourceFile to array of IRuntimeBreakpoint
	private breakPoints = new Map<string, IRuntimeBreakpoint[]>();

	// all instruction breakpoint addresses
	private instructionBreakpoints = new Set<number>();

	// since we want to send breakpoint events, we will assign an id to every event
	// so that the frontend can match events with breakpoints.
	private breakpointId = 1;

	private breakAddresses = new Map<string, string>();
	// keep it for future feature
	private namedException: string | undefined;
	private otherExceptions = false;
	// web3
	private solc: SolcCompiler;
	private compilationResult!: CompilationResult;
	private web3: Web3;
	private traceManager: TraceManager;
	private codeManager: CodeManager;
	private storageResolver: StorageResolver;
	private callTree!: InternalCallTree;
	private curLocation!: SourceLocation;
	private decorator: Decorator;
	private tx!: Transaction;

	constructor(context: vscode.ExtensionContext, private fileAccessor: FileAccessor) {
		super();
		this.solc = new SolcCompiler(context.extensionPath);
		this.web3 = new Web3(userContext.network);
		init.extend(this.web3);
		this.traceManager = new TraceManager(this.web3);
		this.codeManager = new CodeManager(this.web3, this.traceManager);
		this.decorator = new Decorator();
		this.storageResolver = new StorageResolver(this.web3);
	}

	/**
	 * Start executing the given program.
	 */
	public async start(program: string, stopOnEntry: boolean, debug: boolean,
		solidityConfig: {
			contractAddress: string,
			transactionHash: string;
		} | undefined): Promise<void> {

		const contractPath = this.normalizePathAndCasing(program);
		let contractAddress: string | null = solidityConfig?.contractAddress ?? null;
		let txHash: string | null = solidityConfig?.transactionHash ?? null;
		const contractHistory = contractAddress !== null ? userContext.contractHistory[contractAddress] : null;
		let contractName = contractHistory !== null ? contractHistory.contractName : null;
		// reset 
		this.vmTraceIndex = 0;

		this.sourceFile = contractPath;

		// update selectedCompilerVersion
		this.solc.selectedCompilerVersion = userContext.selectedCompilerVersion;
		// diagnostic, light and fast
		this.compilationResult = await this.solc.diagnostic(contractPath);
		console.info("use solidity compiler version:" + this.solc.usedCompilerVersion);
		if (this.compilationResult.errors) {
			vscode.window.showErrorMessage(this.compilationResult.errors.map((item) => item.formattedMessage).join());
			this.sendEvent('end');
			return;
		}
		// compile
		console.info("compile *.sol file:" + contractPath);
		this.compilationResult = await this.solc.compile(contractPath);
		if (this.compilationResult.errors) {
			vscode.window.showErrorMessage(this.compilationResult.errors.map((item) => item.formattedMessage).join());
			this.sendEvent('end');
			return;
		}
		// depoly
		if (contractAddress === null) {
			for (const [itemContractName, itemCompiledContract] of Object.entries(this.compilationResult.contracts![contractPath])) {
				const deployBytecode = itemCompiledContract.evm.deployedBytecode.object;
				contractAddress = userContext.findContractHistory(contractPath, itemContractName, deployBytecode);
				// notify user whether use cache
				if (contractAddress) {
					const answer = await vscode.window.showQuickPick(["Yes", "No"], {
						placeHolder: `${itemContractName} contract no change, use the last deployed address?`
					});
					if (answer === 'Yes') {
						console.info("use last deployed contract address:" + contractAddress);
					} else if (answer === 'No') {
						contractAddress = null;
					} else {
						//cancel
						this.sendEvent('end');
						return;
					}
				}
				if (!contractAddress) {
					console.info(`depoly ${itemContractName} contract in blockchain`);
					contractAddress = await uiFlow.deploy(this.web3, itemCompiledContract);
					if (!contractAddress) {
						vscode.window.showErrorMessage(`Fail to deploy contract: ${itemContractName} in ${contractPath}`);
						this.sendEvent('end');
						return;
					} else {
						userContext.addContractHisory(contractPath, itemContractName, deployBytecode, contractAddress);
						console.log(contractPath, itemContractName, deployBytecode, contractAddress);
					}
				}
			}
		}
		// whether solc bytecode match with history bytecode
		if (contractHistory) {
			const solcDeployBytecode = this.compilationResult.contracts![contractHistory.filePath][contractHistory.contractName].evm.deployedBytecode.object;
			if (contractHistory.deployBytecode !== solcDeployBytecode) {
				vscode.window.showErrorMessage(`Contract source not match with evm bytecode!`);
				this.sendEvent('end');
				return;
			}
		}
		// TODO：register completion items
		// let user choice debug contract
		if (contractName === null) {
			const contractNameList = Object.keys(this.compilationResult.contracts![contractPath]);
			if (contractNameList.length === 1) {
				contractName = contractNameList[0];
			} else {
				const answer = await vscode.window.showQuickPick(contractNameList, {
					placeHolder: "Choice a contract to debug"
				});
				if (!answer) {
					// cancel
					this.sendEvent('end');
					return;
				} else {
					contractName = answer;
				}
			}
		}
		// new tx
		if (txHash === null) {
			// get method invoke data
			const contractAbi = this.compilationResult.contracts![contractPath][contractName!].abi;
			const callMethodData = await multiStepInput(contractAbi);
			if (callMethodData.length === 0) {
				// cancel
				this.sendEvent('end');
				return;
			}

			// invoke
			console.info("invoke contract method", callMethodData);
			txHash = await uiFlow.invoke(this.web3, contractAbi, contractAddress!, callMethodData);
			if (!txHash) {
				vscode.window.showErrorMessage(`Fail to send transaction`);
				this.sendEvent('end');
				return;
			}
			// store cache
			userContext.addTxHistory(contractAddress!, txHash, `${callMethodData[0]}(${callMethodData.slice(1).join(', ')})`);
		}

		try {
			await this.resolveTrace(txHash!, this.compilationResult.contracts![contractPath][contractName].evm);
		} catch (error) {
			vscode.window.showErrorMessage(JSON.stringify(error));
			this.sendEvent('end');
			return;
		}

		// reset 
		this.curLocation = {
			start: -1,
			length: -1,
			file: -1,
			jump: '-',
			modifierDepth: 0
		};

		this.continue(false);
	}

	public async end() {
		this.decorator.clear();
	}

	/**
	 * Continue execution to the end/beginning.
	 */
	public async continue(reverse: boolean) {
		await this.executeLine(reverse);
	}

	/**
	 * Step to the next/previous non empty line.
	 */
	public step(instruction: boolean, reverse: boolean) {

		if (instruction) {
			if (reverse) {
				this.vmTraceIndex--;
			} else {
				this.vmTraceIndex++;
			}
			this.sendEvent('stopOnStep');
		} else {
			this.executeLine(reverse);
		}
	}

	/**
	 * "Step into" for Mock debug means: go to next character
	 */
	public stepIn(targetId: number | undefined) {
		// TODO find a jump in vmTrace index
	}

	/**
	 * "Step out" for Mock debug means: go to previous character
	 */
	public stepOut() {
		// TODO find a jump out vmTrace index
	}

	public getStepInTargets(frameId: number): IRuntimeStepInTargets[] {
		// make every character of the frame a potential "step in" target
		return [{
			id: 1,
			label: `target: c`
		}];
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	public stack(startFrame: number, endFrame: number): IRuntimeStack {
		const frames: IRuntimeStackFrame[] = [];
		// every word of the current line becomes a stack frame.
		for (let i = startFrame; i < Math.min(endFrame, startFrame + 1); i++) {

			const stackFrame: IRuntimeStackFrame = {
				index: i,
				name: `words[i].name(${i})`,	// use a word of the line as the stackframe name
				file: this.sourceFile,
				line: this.currentLine,
				column: this.currentColumn, // words[i].index
				instruction: this.vmTraceIndex
			};

			frames.push(stackFrame);
		}

		return {
			frames: frames,
			count: 1
		};
	}

	/*
	 * Determine possible column breakpoint positions for the given line.
	 * Here we return the start location of words with more than 8 characters.
	 */
	public getBreakpoints(path: string, line: number): number[] {
		return [0];
	}

	/*
	 * Set breakpoint in file with given line.
	 */
	public async setBreakPoint(path: string, line: number): Promise<IRuntimeBreakpoint> {
		path = this.normalizePathAndCasing(path);

		const bp: IRuntimeBreakpoint = { verified: false, line, id: this.breakpointId++ };
		let bps = this.breakPoints.get(path);
		if (!bps) {
			bps = new Array<IRuntimeBreakpoint>();
			this.breakPoints.set(path, bps);
		}
		bps.push(bp);

		return bp;
	}

	/*
	 * Clear breakpoint in file with given line.
	 */
	public clearBreakPoint(path: string, line: number): IRuntimeBreakpoint | undefined {
		const bps = this.breakPoints.get(this.normalizePathAndCasing(path));
		if (bps) {
			const index = bps.findIndex(bp => bp.line === line);
			if (index >= 0) {
				const bp = bps[index];
				bps.splice(index, 1);
				return bp;
			}
		}
		return undefined;
	}

	public clearBreakpoints(path: string): void {
		this.breakPoints.delete(this.normalizePathAndCasing(path));
	}

	public setDataBreakpoint(address: string, accessType: 'read' | 'write' | 'readWrite'): boolean {

		const x = accessType === 'readWrite' ? 'read write' : accessType;

		const t = this.breakAddresses.get(address);
		if (t) {
			if (t !== x) {
				this.breakAddresses.set(address, 'read write');
			}
		} else {
			this.breakAddresses.set(address, x);
		}
		return true;
	}

	public clearAllDataBreakpoints(): void {
		this.breakAddresses.clear();
	}

	public setExceptionsFilters(namedException: string | undefined, otherExceptions: boolean): void {
		this.namedException = namedException;
		this.otherExceptions = otherExceptions;
	}

	public setInstructionBreakpoint(address: number): boolean {
		this.instructionBreakpoints.add(address);
		return true;
	}

	public clearInstructionBreakpoints(): void {
		this.instructionBreakpoints.clear();
	}

	public async getGlobalVariables(cancellationToken?: () => boolean): Promise<RuntimeVariable[]> {

		let a: RuntimeVariable[] = [];
		const address = this.traceManager.getCurrentCalledAddressAt(this.vmTraceIndex)!;
		const globalVar = await this.callTree.solidityProxy.extractStateVariablesAt(this.vmTraceIndex);
		const viewer = new StorageViewer({ stepIndex: this.vmTraceIndex, tx: this.tx, address },
			this.storageResolver, this.traceManager);
		const globalVarDecoded = await stateDecoder.decodeState(globalVar, viewer);

		for (const [varName, varData] of Object.entries(globalVarDecoded)) {
			a.push(new RuntimeVariable(varName, varData.value));
			if (cancellationToken && cancellationToken()) {
				break;
			}
		}

		return a;
	}

	public async getLocalVariables(): Promise<RuntimeVariable[]> {
		const address = this.traceManager.getCurrentCalledAddressAt(this.vmTraceIndex)!;
		const viewer = new StorageViewer({ stepIndex: this.vmTraceIndex, tx: this.tx, address },
			this.storageResolver, this.traceManager);
		const stack = this.traceManager.getStackAt(this.vmTraceIndex);
		const memory = this.traceManager.getTraceLog(this.vmTraceIndex).memory;
		const calldata = this.traceManager.getCallDataAt(this.vmTraceIndex);
		const locals = await localDecoder.solidityLocals(this.vmTraceIndex, this.callTree, stack, memory, viewer, calldata, this.curLocation, null);

		let a: RuntimeVariable[] = [];

		for (const [varName, varData] of Object.entries(locals)) {
			a.push(new RuntimeVariable(varName, varData.value));
		}
		return a;
	}

	public getLocalVariable(name: string): RuntimeVariable | undefined {
		return this.variables.get(name);
	}

	/**
	 * Return words of the given address range as "instructions"
	 */
	public disassemble(address: number, instructionCount: number): RuntimeDisassembledInstruction[] {

		const instructions: RuntimeDisassembledInstruction[] = [];

		// for (let a = address; a < address + instructionCount; a++) {
		// 	if (a >= 0 && a < this.instructions.length) {
		// 		instructions.push({
		// 			address: a,
		// 			instruction: this.instructions[a].name,
		// 			line: this.instructions[a].line
		// 		});
		// 	} else {
		// 		instructions.push({
		// 			address: a,
		// 			instruction: 'nop'
		// 		});
		// 	}
		// }

		return instructions;
	}

	// private methods

	private async resolveTrace(txHash: string, evm: any) {
		this.tx = await this.web3.eth.getTransaction(txHash);
		await this.traceManager.resolveTrace(this.tx);

		const solidityProxy = new SolidityProxy(this.traceManager, () => {
			return evm;
		});
		solidityProxy.reset(this.compilationResult);
		this.callTree = new InternalCallTree(this.traceManager, solidityProxy, this.codeManager);
		await this.callTree.newTraceLoaded();
	}

	private async executeLine(reverse: boolean) {
		const fileInfo: {
			[id: number]: {
				filePath: string;
				lineOffset: number[];
			};
		} = {};
		for (const [filePath, compilationSource] of Object.entries(this.compilationResult.sources!)) {
			fileInfo[compilationSource.id] = {
				filePath,
				lineOffset: this.getLineOffset((await this.fileAccessor.readFile(filePath)).toString())
			};

		}

		// find next valid location
		while (reverse ? this.vmTraceIndex >= 0 : this.vmTraceIndex < this.traceManager.getLength()) {
			reverse ? this.vmTraceIndex-- : this.vmTraceIndex++;
			if (this.vmTraceIndex < 0 || this.vmTraceIndex >= this.traceManager.getLength()) {
				this.sendEvent('end');
				return;
			}
			const sourceLocation = await this.callTree.extractSourceLocation(this.vmTraceIndex);
			if (!sourceLocation || !fileInfo[sourceLocation.file]) {
				continue;
			}
			const traceLog = this.traceManager.getTraceLog(this.vmTraceIndex);
			// filter some op
			// if (traceLog.op.startsWith('DUP')
			// 	|| traceLog.op.startsWith('PUSH')
			// 	|| traceLog.op.startsWith('JUMP')
			// 	|| traceLog.op.startsWith('CALLDATASIZE')) {
			// 	continue;
			// }
			const oldLocation = this.curLocation;
			this.curLocation = sourceLocation;
			if (this.curLocation.file !== oldLocation.file
				|| this.curLocation.start !== oldLocation.start
				|| this.curLocation.length !== oldLocation.length) {
				// find a source location change
				this.currentLine = util.findLowerBound(this.curLocation.start, fileInfo[this.curLocation.file].lineOffset);
				this.sourceFile = fileInfo[this.curLocation.file].filePath;
				// highlight
				const startLine = this.currentLine;
				const startColum = this.curLocation.start - fileInfo[this.curLocation.file].lineOffset[startLine] - 1;
				const endLine = util.findLowerBound(this.curLocation.start + this.curLocation.length - 1, fileInfo[this.curLocation.file].lineOffset);
				const endColum = this.curLocation.start + this.curLocation.length - fileInfo[this.curLocation.file].lineOffset[endLine] - 1;

				this.currentColumn = startColum;

				this.decorator.decorate(vscode.window.activeTextEditor!,
					startLine,
					startColum,
					endLine,
					endColum
				);
				this.sendEvent('stopOnStep');
				break;
			}
		}
	}

	private getLineOffset(source: string) {
		const ret = [];
		ret.push(0);
		for (let pos = source.indexOf('\n'); pos >= 0; pos = source.indexOf('\n', pos + 1)) {
			ret.push(pos);
		}
		return ret;
	}

	private sendEvent(event: string, ...args: any[]): void {
		setTimeout(() => {
			this.emit(event, ...args);
		}, 0);
	}

	private normalizePathAndCasing(path: string) {
		if (process.platform === 'win32') {
			return path.replace(/\//g, '\\').toLowerCase();
		} else {
			return path.replace(/\\/g, '/');
		}
	}
}
