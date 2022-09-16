'use strict';
import { util } from '../../common/utils';
import { TraceAnalyser } from './traceAnalyser';
import { Call, TraceCache } from './traceCache';
import * as traceHelper from './traceHelper';
import { Transaction } from 'web3-eth';
import { StructLog, TraceTransaction, TraceTransactionOptions } from '../../common/type';
import Web3 from 'web3';

export class TraceManager {
  private web3: Web3;
  private fork: string = "london";
  private isLoading: boolean = false;
  private trace: StructLog[] = [];
  private traceCache!: TraceCache;

  constructor(web3: Web3) {
    this.web3 = web3;
  }

  // init section
  async resolveTrace(tx: Transaction) {
    this.traceCache = new TraceCache();
    this.isLoading = true;
    try {
      const result = await this.getTrace(tx.hash);
      if (result.structLogs.length > 0) {
        this.trace = result.structLogs;
        TraceAnalyser.analyse(this.trace, tx, this.traceCache);
        return true;
      } else {
        throw new Error(tx.hash + ' is not a contract invocation or contract creation.');
      }
    } finally {
      this.isLoading = false;
    }
  }

  async buildCallPath(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    const callsPath = util.buildCallPath(vmTraceIndex, this.traceCache.callsTree!.call);
    return callsPath;
  }

  getCurrentFork() {
    return this.fork;
  }

  // API section
  inRange(step: number) {
    return this.isLoaded() && step >= 0 && step < this.trace.length;
  }

  isLoaded() {
    return !this.isLoading && this.trace.length > 0;
  }

  getLength() {
    return this.trace.length;
  }

  accumulateStorageChanges(index: number, address: string, storageOrigin: {}) {
    return this.traceCache.accumulateStorageChanges(index, address, storageOrigin);
  }

  getCallDataAt(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    const callDataChange = util.findLowerBoundValue(vmTraceIndex, this.traceCache.callDataChanges);
    if (callDataChange === null) {
      throw new Error('no calldata found');
    }
    return [this.traceCache.callsData[callDataChange]];
  }

  getCallStackAt(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    const call = util.findCall(vmTraceIndex, this.traceCache.callsTree!.call);
    return call.callStack;
  }

  getStackAt(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    const stack = this.trace[vmTraceIndex].stack.slice(0);
    stack.reverse();
    return stack.map(el => el.startsWith('0x') ? el : '0x' + el);
  }

  getLastCallChangeSince(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    const callChange: Call = util.findCall(vmTraceIndex, this.traceCache.callsTree!.call);
    return callChange;
  }

  getCurrentCalledAddressAt(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    const resp = this.getLastCallChangeSince(vmTraceIndex);
    if (!resp) {
      throw new Error('unable to get current called address. ' + vmTraceIndex + ' does not match with a CALL');
    }
    return resp.address;
  }

  getContractCreationCode(token: string) {
    if (!this.traceCache.contractCreation[token]) {
      throw new Error('no contract creation named ' + token);
    }
    return this.traceCache.contractCreation[token];
  }

  getReturnValue(vmTraceIndex: number) {
    this.checkRequestedStep(vmTraceIndex);
    if (!this.traceCache.returnValues[vmTraceIndex]) {
      throw new Error('current step is not a return step');
    }
    return this.traceCache.returnValues[vmTraceIndex];
  }

  getCurrentStep(stepIndex: number) {
    this.checkRequestedStep(stepIndex);
    return this.traceCache.steps[stepIndex];
  }

  /**
   * replace those mehods: getRemainingGas、getStepCost、getMemExpand、getCurrentPC、getMemoryAt
   * @param vmTraceIndex 
   * @returns StructLog
   */
  getTraceLog(vmTraceIndex: number): StructLog {
    this.checkRequestedStep(vmTraceIndex);
    return this.trace[vmTraceIndex];
  }

  isCreationStep(stepIndex: number) {
    return traceHelper.isCreateInstruction(this.trace[stepIndex]);
  }

  // step section
  findStepOverBack(currentStep: number) {
    const state = this.trace[currentStep];
    if (traceHelper.isReturnInstruction(state)) {
      const call = util.findCall(currentStep, this.traceCache.callsTree!.call);
      return call.start > 0 ? call.start - 1 : 0;
    }
    return currentStep > 0 ? currentStep - 1 : 0;
  }

  findStepOverForward(currentStep: number) {
    const state = this.trace[currentStep];
    if (traceHelper.isCallInstruction(state) && !traceHelper.isCallToPrecompiledContract(currentStep, this.trace)) {
      const call = util.findCall(currentStep + 1, this.traceCache.callsTree!.call);
      return call.return! + 1 < this.trace.length ? call.return! + 1 : this.trace.length - 1;
    }
    return this.trace.length >= currentStep + 1 ? currentStep + 1 : currentStep;
  }

  findNextCall(currentStep: number) {
    const call = util.findCall(currentStep, this.traceCache.callsTree!.call);
    const subCalls = Object.keys(call.calls);
    if (subCalls.length) {
      const callStart = util.findLowerBound(currentStep, subCalls.map(Number)) + 1;
      if (subCalls.length > callStart) {
        return parseInt(subCalls[callStart]) - 1;
      }
      return currentStep;
    }
    return currentStep;
  }

  findStepOut(currentStep: number) {
    const call = util.findCall(currentStep, this.traceCache.callsTree!.call);
    return call.return;
  }

  getAddresses() {
    return this.traceCache.addresses;
  }

  getAllStopIndexes() {
    return this.traceCache.stopIndexes;
  }

  getAllOutofGasIndexes() {
    return this.traceCache.outofgasIndexes;
  }

  private checkRequestedStep(stepIndex: number) {
    if (this.trace.length === 0) {
      throw new Error('trace not loaded');
    } else if (stepIndex >= this.trace.length || stepIndex < 0) {
      throw new Error(`trace length=${this.trace.length},index out of range, stepIndex=${stepIndex},`);
    }
  }

  private getTrace(txHash: string) {
    return new Promise<TraceTransaction>((resolve, reject) => {
      const options = new TraceTransactionOptions();
      options.disableStorage = false;
      options.enableMemory = true;
      options.disableMemory = false;
      options.disableStack = false;
      options.fullStorage = false;
      (this.web3 as any).debug.traceTransaction(txHash, options, function (error: any, result: TraceTransaction) {
        if (error) {
          return reject(error);
        }
        resolve(result);
      });
    });
  }
}
