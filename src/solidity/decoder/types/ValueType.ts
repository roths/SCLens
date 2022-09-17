'use strict';
import { BN } from 'ethereumjs-util';
import { StorageViewer } from '../../storage/storageViewer';
import { extractHexValue } from './util';

export abstract class ValueType {
  storageSlots: number;
  storageBytes: number;
  typeName: string;
  basicType: string;

  constructor(storageSlots: number, storageBytes: number, typeName: string) {
    this.storageSlots = storageSlots;
    this.storageBytes = storageBytes;
    this.typeName = typeName;
    this.basicType = 'ValueType';
  }

  abstract decodeValue(input: string): any;

  async decodeFromStorage(location: {
    offset: number,
    slot: BN;
  }, storageViewer: StorageViewer) {
    try {
      const value = await extractHexValue(location, storageViewer, this.storageBytes);
      return { value: this.decodeValue(value), type: this.typeName };
    } catch (e: any) {
      console.log(e);
      return { error: '<decoding failed - ' + e.message + '>', type: this.typeName };
    }
  }

  decodeFromStack(stackDepth: number, stack: string[]) {
    let value;
    if (stackDepth >= stack.length) {
      value = this.decodeValue('');
    } else {
      value = this.decodeValue(stack[stack.length - 1 - stackDepth].replace('0x', ''));
    }
    return { value, type: this.typeName };
  }

  decodeFromMemory(offset: number, memory: string) {
    const value = memory.substr(2 * offset, 64);
    return { value: this.decodeValue(value), type: this.typeName };
  }
}
