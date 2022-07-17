'use strict'
import { util } from '@remix-project/remix-lib';
import { TraceAnalyser } from './traceAnalyser'
import { TraceCache } from './traceCache'
import { TraceStepManager } from './traceStepManager'
import { isCreateInstruction } from './traceHelper'
import { Transaction } from 'web3-eth';
import { StructLog, TraceTransaction, TraceTransactionOptions } from '../web3_type'
import Web3 from 'web3';

export class TraceManager {
  web3: Web3;
  fork!: string;
  isLoading: boolean;
  trace: StructLog[] | null;
  traceCache: TraceCache;
  traceAnalyser: TraceAnalyser;
  traceStepManager: TraceStepManager;
  tx!: Transaction;

  constructor(web3: Web3) {
    this.web3 = web3
    this.isLoading = false
    this.trace = null;
    this.traceCache = new TraceCache()
    this.traceAnalyser = new TraceAnalyser(this.traceCache)
    this.traceStepManager = new TraceStepManager(this.traceAnalyser)
  }

  // init section
  async resolveTrace(tx: Transaction) {
    this.tx = tx;
    this.init();
    if (!this.web3) {
      throw new Error('web3 not loaded');
    }
    this.isLoading = true;
    const result = await this.getTrace(tx.hash);
    try {
      if (result.structLogs.length > 0) {
        this.trace = result.structLogs;
        this.traceAnalyser.analyse(result.structLogs, tx);
        this.isLoading = false;
        return true;
      }
      const mes = tx.hash + ' is not a contract invocation or contract creation.'
      console.log(mes)
      this.isLoading = false
      throw new Error(mes)
    } catch (error: any) {
      console.log(error)
      this.isLoading = false
      throw new Error(error);
    }
  }

  getTrace(txHash: string) {
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

  init() {
    this.trace = null
    this.traceCache.init();
  }

  getCurrentFork() {
    return this.fork;
  }

  // API section
  inRange(step: number) {
    return this.isLoaded() && step >= 0 && step < this.trace!.length;
  }

  isLoaded() {
    return !this.isLoading && this.trace !== null;
  }

  getLength(callback: any) {
    if (!this.trace) {
      callback(new Error('no trace available'), null);
    } else {
      callback(null, this.trace.length);
    }
  }

  accumulateStorageChanges(index: number, address: string, storageOrigin: {}) {
    return this.traceCache.accumulateStorageChanges(index, address, storageOrigin);
  }

  getAddresses() {
    return this.traceCache.addresses
  }

  getCallDataAt(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    const callDataChange = util.findLowerBoundValue(stepIndex, this.traceCache.callDataChanges)
    if (callDataChange === null) {
      throw new Error('no calldata found')
    }
    return [this.traceCache.callsData[callDataChange]]
  }

  async buildCallPath(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    const callsPath = util.buildCallPath(stepIndex, this.traceCache.callsTree?.call)
    if (callsPath === null) throw new Error('no call path built')
    return callsPath
  }

  getCallStackAt(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    const call = util.findCall(stepIndex, this.traceCache.callsTree?.call)
    if (call === null) {
      throw new Error('no callstack found')
    }
    return call.callStack
  }

  getStackAt(stepIndex: number) {
    this.checkRequestedStep(stepIndex)
    if (this.trace != null && this.trace[stepIndex] && this.trace[stepIndex].stack) { // there's always a stack
      const stack = this.trace[stepIndex].stack.slice(0)
      stack.reverse()
      return stack.map(el => el.startsWith('0x') ? el : '0x' + el)
    } else {
      throw new Error('no stack found')
    }
  }

  getLastCallChangeSince(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }

    const callChange = util.findCall(stepIndex, this.traceCache.callsTree!.call)
    if (callChange === null) {
      return 0
    }
    return callChange
  }

  getCurrentCalledAddressAt(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
      const resp = this.getLastCallChangeSince(stepIndex)
      if (!resp) {
        throw new Error('unable to get current called address. ' + stepIndex + ' does not match with a CALL')
      }
      return resp.address
    } catch (error: any) {
      throw new Error(error)
    }
  }

  getContractCreationCode(token: string) {
    if (!this.traceCache.contractCreation[token]) {
      throw new Error('no contract creation named ' + token)
    }
    return this.traceCache.contractCreation[token]
  }

  getMemoryAt(stepIndex: number) {
    this.checkRequestedStep(stepIndex)
    if (this.trace != null && this.trace[stepIndex] && this.trace[stepIndex].memory) { // there's always a stack
      return this.trace![stepIndex].memory
    } else {
      throw new Error('no memory found')
    }
  }

  getCurrentPC(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    return this.trace![stepIndex].pc
  }

  getAllStopIndexes() {
    return this.traceCache.stopIndexes
  }

  getAllOutofGasIndexes() {
    return this.traceCache.outofgasIndexes
  }

  getReturnValue(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    if (!this.traceCache.returnValues[stepIndex]) {
      throw new Error('current step is not a return step')
    }
    return this.traceCache.returnValues[stepIndex]
  }

  getCurrentStep(stepIndex: number) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    return this.traceCache.steps[stepIndex]
  }

  getMemExpand(stepIndex: number) {
    return (this.getStepProperty(stepIndex, 'memexpand') || '')
  }

  getStepCost(stepIndex: number) {
    return this.getStepProperty(stepIndex, 'gasCost')
  }

  getRemainingGas(stepIndex: number) {
    return this.getStepProperty(stepIndex, 'gas')
  }

  getStepProperty(stepIndex: number, property: string) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check: any) {
      throw new Error(check)
    }
    return (this.trace![stepIndex] as any)[property]
  }

  isCreationStep(stepIndex: number) {
    return isCreateInstruction(this.trace![stepIndex])
  }

  // step section
  findStepOverBack(currentStep: number) {
    return this.traceStepManager.findStepOverBack(currentStep)
  }

  findStepOverForward(currentStep: number) {
    return this.traceStepManager.findStepOverForward(currentStep)
  }

  findNextCall(currentStep: number) {
    return this.traceStepManager.findNextCall(currentStep)
  }

  findStepOut(currentStep: number) {
    return this.traceStepManager.findStepOut(currentStep)
  }

  checkRequestedStep(stepIndex: number) {
    if (!this.trace) {
      throw new Error('trace not loaded')
    } else if (stepIndex >= this.trace.length) {
      throw new Error('trace smaller than requested')
    }
  }

  waterfall(calls: any, stepindex: number, cb: any) {
    const ret: any[] = []
    let retError = null
    for (const call in calls) {
      calls[call].apply(this, [stepindex, function (error: any, result: any) {
        retError = error
        ret.push({ error: error, value: result })
      }])
    }
    cb(retError, ret)
  }
}
