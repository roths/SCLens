/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter } from 'events';
import { TextDecoder, TextEncoder } from 'util';
import { SolcCompiler } from '../../common/solcCompiler';
import * as vscode from 'vscode';
import { CompilationResult } from '../../common/type';
import Web3 from 'web3';
import { init } from '@remix-project/remix-debug';
import { TraceManager } from '../../solidity/trace/traceManager';
import { CodeManager, SourceLocation } from '../../solidity/code/codeManager';
import { userContext } from '../../common/userContext';
import { multiStepInput } from '../ui/invokeFuncStepView';
import { InternalCallTree, localDecoder, SolidityProxy, stateDecoder } from '../../solidity/solidity-decoder';
import { util } from '@remix-project/remix-lib';
import { Decorator } from '../ui/highlightUtil';
import { StorageViewer } from '../../solidity/storage/storageViewer';
import { Transaction } from 'web3-core';
import { StorageResolver } from '../../solidity/storage/storageResolver';
import { uiFlow } from '../../common/userStoryFlow';
import { InstructionListViewProvider } from '../ui/instructionListView';
import { getLineOffset, getSourceRange, getText } from '../../common/utils/file';

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
export class SolidityRuntime extends EventEmitter {

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
	private solidityProxy: SolidityProxy;

	// web3 context
	private curLocation!: SourceLocation;
	private decorator: Decorator;
	private tx!: Transaction;
	private contractAddress!: string;
	private vmTraceIndex = 0;
	private fileInfo: {
		[fileId: number]: {
			filePath: string;
			lineOffset: number[];
		};
	} = {};

	constructor(context: vscode.ExtensionContext) {
		super();
		this.solc = new SolcCompiler(context.extensionPath);
		this.web3 = userContext.getWeb3Provider();
		init.extend(this.web3);
		this.traceManager = new TraceManager(this.web3);
		this.codeManager = new CodeManager(this.web3, this.traceManager);
		this.solidityProxy = new SolidityProxy(this.traceManager, this.codeManager);
		this.callTree = new InternalCallTree(this.traceManager, this.solidityProxy, this.codeManager);
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
		if (this.compilationResult.errors && this.solc.hasFatal(this.compilationResult.errors)) {
			vscode.window.showErrorMessage(this.compilationResult.errors.map((item) => item.formattedMessage).join());
			this.sendEvent('end');
			return;
		}
		// compile
		console.info("compile *.sol file:" + contractPath);
		this.compilationResult = await this.solc.compile(contractPath);
		if (this.compilationResult.errors && this.solc.hasFatal(this.compilationResult.errors)) {
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
			await this.resolveTrace(txHash!);
		} catch (error: any) {
			vscode.window.showErrorMessage("fail to resolve", error);
			this.sendEvent('end');
			return;
		}

		// reset context 
		this.curLocation = {
			start: -1,
			length: -1,
			file: -1,
			jump: '-',
			modifierDepth: 0
		};
		this.contractAddress = contractAddress!;
		this.fileInfo = {};
		for (const [filePath, compilationSource] of Object.entries(this.compilationResult.sources!)) {
			this.fileInfo[compilationSource.id] = {
				filePath,
				lineOffset: getLineOffset(await getText(filePath))
			};
		}
		this.step(false, false);
		InstructionListViewProvider.triggerRefresh((await this.codeManager.getInstructions(contractAddress!)).instructions);
	}

	public async end() {
		InstructionListViewProvider.triggerRefresh([]);
		this.decorator.clear();
	}

	/**
	 * Continue execution to the end/beginning.
	 */
	public async continue(reverse: boolean) {
		const nextVmIndex = await this.findNextBreakpoint(reverse);
		await this.jumpTo(nextVmIndex);
	}

	/**
	 * Step to the next/previous non empty line.
	 */
	public async step(instruction: boolean, reverse: boolean) {
		const nextVmIndex = await this.findNextLine(reverse, this.vmTraceIndex, false);
		this.jumpTo(nextVmIndex);
	}

	public async stepIn(targetId: number | undefined) {
		const nextVmIndex = await this.findFuncScopeBound(false);
		this.jumpTo(nextVmIndex);
	}

	/**
	 * "Step out" for Mock debug means: go to previous character
	 */
	public async stepOut() {
		const nextVmIndex = await this.findFuncScopeBound(true);
		this.jumpTo(nextVmIndex);
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
		const globalVar = await this.solidityProxy.extractStateVariablesAt(this.vmTraceIndex);
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

	private async resolveTrace(txHash: string) {
		this.tx = await this.web3.eth.getTransaction(txHash);
		await this.traceManager.resolveTrace(this.tx);
		this.solidityProxy.reset(this.compilationResult);
		await this.callTree.newTraceLoaded();
	}

	/**
	 * use for stepIn and stepOut
	 */
	private async findFuncScopeBound(out: boolean): Promise<number> {
		let nextTraceindex = -1;
		if (out) {
			const funcScopeEnd = this.callTree.findScope(this.vmTraceIndex)!.lastStep;
			nextTraceindex = await this.findNextLine(false, funcScopeEnd, false);
		} else {
			nextTraceindex = await this.findNextLine(false, this.vmTraceIndex, true);
		}
		return nextTraceindex;
	}

	private async findNextBreakpoint(reverse: boolean) {
		let nextTraceindex = -1;
		let curTraceIndex = this.vmTraceIndex;
		const maxIndex = this.traceManager.getLength();
		// find next valid location
		while (reverse ? curTraceIndex >= 0 : curTraceIndex < maxIndex) {
			reverse ? curTraceIndex-- : curTraceIndex++;
			if (curTraceIndex < 0 || curTraceIndex >= maxIndex) {
				break;
			}

			const newLocation = await this.callTree.extractSourceLocation(curTraceIndex);
			if (!newLocation || !this.fileInfo[newLocation.file]) {
				continue;
			}

			const traceLog = this.traceManager.getTraceLog(curTraceIndex);
			// filter some op
			if (traceLog.op.startsWith('DUP')
				|| traceLog.op.startsWith('PUSH')
				|| traceLog.op.startsWith('JUMP')
				|| traceLog.op.startsWith('CALLDATASIZE')) {
				// we need to stop before jump into other function
				if (newLocation.jump !== 'i') {
					continue;
				}
			}

			// if source location not change, continue
			const filePath = this.fileInfo[newLocation.file].filePath;
			const bps = this.breakPoints.get(filePath);
			const startLine = util.findLowerBound(newLocation.start, this.fileInfo[newLocation.file].lineOffset);

			let match = false;
			bps?.forEach((bp) => {
				if (bp.line === startLine) {
					match = true;
				}
			});
			if (!match) {
				continue;
			}
			nextTraceindex = curTraceIndex;
			break;
		}

		return nextTraceindex;
	}

	private async findNextLine(reverse: boolean, startIndex: number, stepIn: boolean) {
		let nextVmTraceindex = -1;
		let curTraceIndex = startIndex;
		const maxIndex = this.traceManager.getLength();
		const oldIndex = startIndex;
		const oldLocation = this.curLocation;
		const oldScopeEnd = this.callTree.findScope(curTraceIndex)!.lastStep;
		// find next valid location
		while (reverse ? curTraceIndex >= 0 : curTraceIndex < maxIndex) {
			reverse ? curTraceIndex-- : curTraceIndex++;
			if (curTraceIndex < 0 || curTraceIndex >= maxIndex) {
				break;
			}

			const newLocation = await this.callTree.extractSourceLocation(curTraceIndex);
			if (!newLocation || !this.fileInfo[newLocation.file]) {
				continue;
			}
			// if source location not change, continue
			if (newLocation.file === oldLocation.file
				&& newLocation.start === oldLocation.start
				&& newLocation.length === oldLocation.length) {
				continue;
			}

			const traceLog = this.traceManager.getTraceLog(curTraceIndex);
			// filter some op
			if (traceLog.op.startsWith('DUP')
				|| traceLog.op.startsWith('PUSH')
				|| traceLog.op.startsWith('JUMP')
				|| traceLog.op.startsWith('CALLDATASIZE')) {
				// we need to stop before jump into other function
				if (newLocation.jump !== 'i') {
					continue;
				}
			}
			// check if jump into other function scope
			if (!stepIn) {
				const scope = this.callTree.findScope(curTraceIndex);
				const nextScopeStart = scope!.firstStep;
				const nextScopeEnd = scope!.lastStep;
				if (nextScopeStart === nextScopeEnd && nextScopeStart === 0) {
					continue;
				}
				if (nextScopeEnd !== oldScopeEnd) {
					const closestFuncCallIndex = util.findLowerBound(oldIndex, this.callTree.functionCallStack);
					if (closestFuncCallIndex + 1 < this.callTree.functionCallStack.length
						&& curTraceIndex >= this.callTree.functionCallStack[closestFuncCallIndex]) {
						// immediately jump to function scope end, and find next valid line
						curTraceIndex = nextScopeEnd;
						continue;
					}
				}
			}
			nextVmTraceindex = curTraceIndex;
			break;
		}

		return nextVmTraceindex;
	}

	private async jumpTo(targetTraceIndex: number) {
		if (targetTraceIndex === -1) {
			this.sendEvent('end');
			return;
		}

		const newLocation = await this.callTree.extractSourceLocation(targetTraceIndex);
		if (newLocation === null) {
			throw new Error('[jumpTo] target location should not be null');
		}
		const curFileInfo = this.fileInfo[newLocation.file];
		// find a source location range
		const { startLine, startColum, endLine, endColum } = getSourceRange(curFileInfo.lineOffset, newLocation.start, newLocation.start + newLocation.length);
		// highlight
		this.decorator.decorate(vscode.window.activeTextEditor!,
			startLine,
			startColum,
			endLine,
			endColum
		);
		// save context
		InstructionListViewProvider.triggerSelect(await this.codeManager.getInstructionIndex(this.contractAddress, targetTraceIndex));
		this.currentColumn = startColum;
		this.sourceFile = curFileInfo.filePath;
		this.currentLine = startLine;
		this.curLocation = newLocation;
		this.vmTraceIndex = targetTraceIndex;
		this.sendEvent('stopOnStep');
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
