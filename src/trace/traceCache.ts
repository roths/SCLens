'use strict';
import { util } from '@remix-project/remix-lib';
import { StructLog } from '../common/type';

export interface Call {
  op: string,
  address: string | null,
  callStack: string[],
  calls: { [key: number]: Call; },
  start: number,
  return?: number,
  reverted?: boolean;
}

export interface CurrentCall {
  call: Call,
  parent: CurrentCall | null,
}

/**
 * get and cache all state fields from trace log 
 */
export class TraceCache {
  returnValues: {
    [vmTraceIndex: number]: string[];
  } = {};

  stopIndexes: {
    vmTraceIndex: number;
    address: string | null;
  }[] = [];

  outofgasIndexes: {
    vmTraceIndex: number;
    address: string | null;
  }[] = [];

  currentCall: CurrentCall | null;
  callsTree!: { call: Call; } | null;

  callsData!: {
    [key: number]: string;
  };

  contractCreation!: {
    [key: string]: string;
  };

  steps!: {
    [key: number]: number;
  };
  addresses: (string | null)[] = [];
  callDataChanges: number[] = [];
  memoryChanges: number[] = [];
  storageChanges: number[] = [];
  sstore: {
    [vmTraceIndex: number]: {
      address: string,
      key: string | null,
      value: string | null,
      hashedKey: string | null;
    };
  } = {};

  constructor() {
    // ...Changes contains index in the vmtrace of the corresponding changes

    this.returnValues = {};
    this.stopIndexes = [];
    this.outofgasIndexes = [];
    this.currentCall = null;
    this.callsTree = null;
    this.callsData = {};
    this.contractCreation = {};
    this.steps = {};
    this.addresses = [];
    this.callDataChanges = [];
    this.memoryChanges = [];
    this.storageChanges = [];
    this.sstore = {}; // all sstore occurence in the trace
  }

  pushSteps(vmTraceIndex: number, currentCallIndex: number) {
    this.steps[vmTraceIndex] = currentCallIndex;
  }

  pushCallDataChanges(vmTraceIndex: number, calldata: string) {
    this.callDataChanges.push(vmTraceIndex);
    this.callsData[vmTraceIndex] = calldata;
  }

  pushMemoryChanges(vmTraceIndex: number) {
    this.memoryChanges.push(vmTraceIndex);
  }

  // outOfGas has been removed because gas left logging is apparently made differently
  // in the vm/geth/eth. TODO add the error property (with about the error in all clients)
  pushCall(traceLog: StructLog, vmTraceIndex: number, address: string | null, callStack: string[], reverted: boolean = false) {
    const validReturnStep = traceLog.op === 'RETURN' || traceLog.op === 'STOP';
    if ((validReturnStep || reverted) && (this.currentCall)) {
      this.currentCall.call.return = vmTraceIndex - 1;
      if (!validReturnStep) {
        this.currentCall.call.reverted = reverted;
      }
      const parent = this.currentCall.parent;
      if (parent) {
        this.currentCall = { call: parent.call, parent: parent.parent };
      }
      return;
    }
    const call: Call = {
      op: traceLog.op,
      address: address,
      callStack: callStack,
      calls: {},
      start: vmTraceIndex
    };
    this.addresses.push(address);
    if (this.currentCall) {
      this.currentCall.call.calls[vmTraceIndex] = call;
    } else {
      this.callsTree = { call: call };
    }
    this.currentCall = { call: call, parent: this.currentCall };
  }

  pushOutOfGasIndex(vmTraceIndex: number, address: string | null) {
    this.outofgasIndexes.push({ vmTraceIndex, address });
  }

  pushStopIndex(vmTraceIndex: number, address: string | null) {
    this.stopIndexes.push({ vmTraceIndex, address });
  }

  pushReturnValue(vmTraceIndex: number, value: string[]) {
    this.returnValues[vmTraceIndex] = value;
  }

  pushContractCreationFromMemory(vmTraceIndex: number, token: string, trace: StructLog[], lastMemoryChange: number) {
    const memory = trace[lastMemoryChange].memory;
    const stack = trace[vmTraceIndex].stack;
    const offset = 2 * parseInt(stack[stack.length - 2], 16);
    const size = 2 * parseInt(stack[stack.length - 3], 16);
    this.contractCreation[token] = '0x' + memory.join('').substr(offset, size);
  }

  pushContractCreation(token: string, code: string) {
    this.contractCreation[token] = code;
  }

  resetStoreChanges() {
    this.sstore = {};
    this.storageChanges = [];
  }

  pushStoreChanges(vmTraceIndex: number, address: string, key: string | null = null, value: string | null = null) {
    this.sstore[vmTraceIndex] = {
      address: address,
      key: key,
      value: value,
      hashedKey: key && util.sha3_256(key)
    };
    this.storageChanges.push(vmTraceIndex);
  }

  accumulateStorageChanges(vmTraceIndex: number, address: string, storage: any) {
    const ret: { [key: string]: { key: string, value: string; }; } = Object.assign({}, storage);
    for (const k in this.storageChanges) {
      const changesIndex = this.storageChanges[k];
      if (changesIndex > vmTraceIndex) {
        return ret;
      }
      const sstore = this.sstore[changesIndex];
      if (sstore.address === address && sstore.key) {
        ret[sstore.hashedKey!] = {
          key: sstore.key,
          value: sstore.value!
        };
      }
    }
    return ret;
  }
}
