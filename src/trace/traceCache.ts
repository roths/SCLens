'use strict'
import { util } from '@remix-project/remix-lib'
import { StructLog } from '../web3_type';
// eslint-disable-next-line camelcase
const { sha3_256 } = util;

interface Call {
  op: string,
  address: string | null,
  callStack: string[],
  calls: { [key: number]: Call },
  start: number,
  return?: number,
  reverted?: boolean
}

interface CurrentCall {
  call: Call,
  parent: CurrentCall | null,
}

export class TraceCache {
  returnValues!: {
    [step: number]: string[]
  };
  stopIndexes!: { index: number, address: string | null }[];
  outofgasIndexes!: { index: number, address: string | null }[];
  currentCall!: CurrentCall | null;
  callsTree!: { call: Call } | null;
  callsData!: {
    [key: number]: string
  };
  contractCreation!: {
    [key: string]: string
  };
  steps!: {
    [key: number]: number
  };
  addresses!: (string | null)[];
  callDataChanges!: number[];
  memoryChanges!: number[];
  storageChanges!: number[];
  sstore!: {
    [key: number]: {
      address: string,
      key: string | null,
      value: string | null,
      hashedKey: string | null
    }
  };

  constructor() {
    this.init();
  }


  init() {
    // ...Changes contains index in the vmtrace of the corresponding changes

    this.returnValues = {}
    this.stopIndexes = []
    this.outofgasIndexes = []
    this.currentCall = null
    this.callsTree = null
    this.callsData = {}
    this.contractCreation = {}
    this.steps = {}
    this.addresses = []
    this.callDataChanges = []
    this.memoryChanges = []
    this.storageChanges = []
    this.sstore = {} // all sstore occurence in the trace
  }

  pushSteps(index: number, currentCallIndex: number) {
    this.steps[index] = currentCallIndex;
  }

  pushCallDataChanges(value: number, calldata: string) {
    this.callDataChanges.push(value);
    this.callsData[value] = calldata;
  }

  pushMemoryChanges(value: number) {
    this.memoryChanges.push(value);
  }

  // outOfGas has been removed because gas left logging is apparently made differently
  // in the vm/geth/eth. TODO add the error property (with about the error in all clients)
  pushCall(step: StructLog, index: number, address: string | null, callStack: string[], reverted: boolean = false) {
    const validReturnStep = step.op === 'RETURN' || step.op === 'STOP';
    if ((validReturnStep || reverted) && (this.currentCall)) {
      this.currentCall.call.return = index - 1;
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
      op: step.op,
      address: address,
      callStack: callStack,
      calls: {},
      start: index
    };
    this.addresses.push(address);
    if (this.currentCall) {
      this.currentCall.call.calls[index] = call;
    } else {
      this.callsTree = { call: call };
    }
    this.currentCall = { call: call, parent: this.currentCall };
  }

  pushOutOfGasIndex(index: number, address: string | null) {
    this.outofgasIndexes.push({ index, address });
  }

  pushStopIndex(index: number, address: string | null) {
    this.stopIndexes.push({ index, address });
  }

  pushReturnValue(step: number, value: string[]) {
    this.returnValues[step] = value;
  }

  pushContractCreationFromMemory(index: number, token: string, trace: StructLog[], lastMemoryChange) {
    const memory = trace[lastMemoryChange].memory;
    const stack = trace[index].stack;
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

  pushStoreChanges(index: number, address: string, key: string | null = null, value: string | null = null) {
    this.sstore[index] = {
      address: address,
      key: key,
      value: value,
      hashedKey: key && sha3_256(key)
    };
    this.storageChanges.push(index);
  }

  accumulateStorageChanges(index: number, address: string, storage: any) {
    const ret: { [key: string]: { key: string, value: string } } = Object.assign({}, storage);
    for (const k in this.storageChanges) {
      const changesIndex = this.storageChanges[k];
      if (changesIndex > index) {
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
