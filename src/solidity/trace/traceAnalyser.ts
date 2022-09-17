'use strict';
import { Transaction } from 'web3-core';
import { TraceCache } from './traceCache';
import * as traceHelper from './traceHelper';
import { StructLog } from '../type';

interface TraceContext {
  storageContext: string[],
  currentCallIndex: number,
  lastCallIndex: number;
}

/**
 * build TraceCache from trace log
 */
export class TraceAnalyser {

  static analyse(trace: StructLog[], tx: Transaction, traceCache: TraceCache) {
    traceCache.pushStoreChanges(0, tx.to!);
    let context: TraceContext = {
      storageContext: [tx.to!],
      currentCallIndex: 0,
      lastCallIndex: 0
    };
    const callStack = [tx.to!];
    traceCache.pushCall(trace[0], 0, callStack[0], callStack.slice(0));
    if (traceHelper.isContractCreation(tx.to!)) {
      traceCache.pushContractCreation(tx.to!, tx.input);
    }
    this.buildCalldata(0, tx, true, traceCache, trace);
    for (let k = 0; k < trace.length; k++) {
      const step = trace[k];
      this.buildMemory(k, step, traceCache);
      context = this.buildDepth(k, step, tx, callStack, context, traceCache, trace);
      context = this.buildStorage(k, step, context, traceCache, trace);
      this.buildReturnValues(k, step, traceCache, trace);
    }
    return true;
  }

  private static buildReturnValues(index: number, step: StructLog, traceCache: TraceCache, trace: StructLog[]) {
    if (traceHelper.isReturnInstruction(step)) {
      let offset = 2 * parseInt(step.stack[step.stack.length - 1], 16);
      const size = 2 * parseInt(step.stack[step.stack.length - 2], 16);
      const memory = trace[traceCache.memoryChanges[traceCache.memoryChanges.length - 1]].memory;
      const noOfReturnParams = size / 64;
      const memoryInString = memory.join('');
      const returnParamsObj: string[] = [];
      for (let i = 0; i < noOfReturnParams; i++) {
        returnParamsObj.push('0x' + memoryInString.substring(offset, offset + 64));
        offset += 64;
      }

      traceCache.pushReturnValue(index, returnParamsObj);
    }
    if (traceHelper.isReturnInstruction(step) || traceHelper.isStopInstruction(step) || traceHelper.isRevertInstruction(step)) {
      traceCache.pushStopIndex(index, traceCache.currentCall?.call.address ?? null);
    }

    try {
      if (step.gas - step.gasCost <= 0 || step.error === 'OutOfGas') {
        traceCache.pushOutOfGasIndex(index, traceCache.currentCall?.call.address ?? null);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private static buildCalldata(index: number, tx: Transaction, newContext: boolean, traceCache: TraceCache, trace: StructLog[]) {
    let calldata = '';
    if (index === 0) {
      calldata = tx.input;
      traceCache.pushCallDataChanges(index, calldata);
    } else if (!newContext) {
      const lastCall = traceCache.callsData[traceCache.callDataChanges[traceCache.callDataChanges.length - 2]];
      traceCache.pushCallDataChanges(index + 1, lastCall);
    } else {
      const memory = trace[traceCache.memoryChanges[traceCache.memoryChanges.length - 1]].memory;
      const callStep = trace[index];
      const stack = callStep.stack;
      let offset = 0;
      let size = 0;
      if (callStep.op === 'DELEGATECALL') {
        offset = 2 * parseInt(stack[stack.length - 3], 16);
        size = 2 * parseInt(stack[stack.length - 4], 16);
      } else {
        offset = 2 * parseInt(stack[stack.length - 4], 16);
        size = 2 * parseInt(stack[stack.length - 5], 16);
      }
      calldata = '0x' + memory.join('').substr(offset, size);
      traceCache.pushCallDataChanges(index + 1, calldata);
    }
  }

  private static buildMemory(index: number, step: StructLog, traceCache: TraceCache) {
    if (step.memory) {
      traceCache.pushMemoryChanges(index);
    }
  }

  private static buildStorage(index: number, step: StructLog, context: TraceContext, traceCache: TraceCache, trace: StructLog[]) {
    if (traceHelper.isNewContextStorageInstruction(step) && !traceHelper.isCallToPrecompiledContract(index, trace)) {
      const calledAddress = traceHelper.resolveCalledAddress(index, trace);
      if (calledAddress) {
        context.storageContext.push(calledAddress);
      } else {
        console.log('unable to build storage changes. ' + index + ' does not match with a CALL. storage changes will be corrupted');
      }
      traceCache.pushStoreChanges(index + 1, context.storageContext[context.storageContext.length - 1]);
    } else if (traceHelper.isSSTOREInstruction(step)) {
      traceCache.pushStoreChanges(index + 1, context.storageContext[context.storageContext.length - 1], step.stack[step.stack.length - 1], step.stack[step.stack.length - 2]);
    } else if (traceHelper.isReturnInstruction(step) || traceHelper.isStopInstruction(step)) {
      context.storageContext.pop();
      traceCache.pushStoreChanges(index + 1, context.storageContext[context.storageContext.length - 1]);
    } else if (traceHelper.isRevertInstruction(step)) {
      context.storageContext.pop();
      traceCache.resetStoreChanges();
    }
    return context;
  }

  private static buildDepth(index: number, step: StructLog, tx: Transaction, callStack: string[], context: TraceContext, traceCache: TraceCache, trace: StructLog[]) {
    if (traceHelper.isCallInstruction(step) && !traceHelper.isCallToPrecompiledContract(index, trace)) {
      let newAddress: string | null | undefined;
      if (traceHelper.isCreateInstruction(step)) {
        newAddress = traceHelper.contractCreationToken(index);
        callStack.push(newAddress);
        const lastMemoryChange = traceCache.memoryChanges[traceCache.memoryChanges.length - 1];
        traceCache.pushContractCreationFromMemory(index, newAddress, trace, lastMemoryChange);
      } else {
        newAddress = traceHelper.resolveCalledAddress(index, trace);
        if (newAddress) {
          callStack.push(newAddress);
        } else {
          console.error('unable to build depth changes. ' + index + ' does not match with a CALL. depth changes will be corrupted');
        }
      }
      traceCache.pushCall(step, index + 1, newAddress!, callStack.slice(0));
      this.buildCalldata(index, tx, true, traceCache, trace);
      traceCache.pushSteps(index, context.currentCallIndex);
      context.lastCallIndex = context.currentCallIndex;
      context.currentCallIndex = 0;
    } else if (traceHelper.isReturnInstruction(step) || traceHelper.isStopInstruction(step) || step.error || step.invalidDepthChange) {
      if (index < trace.length) {
        callStack.pop();
        traceCache.pushCall(step, index + 1, null, callStack.slice(0), step.error === null || step.invalidDepthChange);
        this.buildCalldata(index, tx, false, traceCache, trace);
        traceCache.pushSteps(index, context.currentCallIndex);
        context.currentCallIndex = context.lastCallIndex + 1;
      }
    } else {
      traceCache.pushSteps(index, context.currentCallIndex);
      context.currentCallIndex++;
    }
    return context;
  }
}
