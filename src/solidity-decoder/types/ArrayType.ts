'use strict';
import { add, toBN, extractHexValue } from './util';
import { util } from '@remix-project/remix-lib';
import { BN } from 'ethereumjs-util';
import { RefType } from './RefType';
import { SolidityType, Storagelocation } from '../decodeInfo';
import { StorageViewer } from '../../storage/storageViewer';
const sha3256 = util.sha3_256;

export class ArrayType extends RefType {
  underlyingType: SolidityType;
  arraySize: 'dynamic' | number;

  constructor(underlyingType: SolidityType, arraySize: 'dynamic' | number, storageType: string) {
    let storageSlots = null;
    if (arraySize === 'dynamic') {
      storageSlots = 1;
    } else {
      if (underlyingType.storageBytes < 32) {
        const itemPerSlot = Math.floor(32 / underlyingType.storageBytes);
        storageSlots = Math.ceil(arraySize / itemPerSlot);
      } else {
        storageSlots = arraySize * underlyingType.storageSlots;
      }
    }
    const size = arraySize !== 'dynamic' ? arraySize : '';
    super(storageSlots, 32, underlyingType.typeName + '[' + size + ']', storageType);
    this.underlyingType = underlyingType;
    this.arraySize = arraySize;
  }

  async decodeFromStorage(location: Storagelocation, storageViewer: StorageViewer): any {
    const ret = [];
    let size = null;
    let slotValue;
    try {
      slotValue = await extractHexValue(location, storageViewer, this.storageBytes);
    } catch (e) {
      console.log(e);
      return {
        error: '<decoding failed - ' + e.message + '>',
        type: this.typeName
      };
    }
    const currentLocation = {
      offset: 0,
      slot: location.slot
    };
    if (this.arraySize === 'dynamic') {
      size = toBN('0x' + slotValue);
      currentLocation.slot = sha3256(location.slot);
    } else {
      size = new BN(this.arraySize);
    }
    const k = toBN(0)!;
    for (; k.lt(size!) && k.ltn(300); k.iaddn(1)) {
      try {
        ret.push(await this.underlyingType.decodeFromStorage(currentLocation, storageViewer));
      } catch (e: any) {
        return {
          error: '<decoding failed - ' + e.message + '>',
          type: this.typeName
        };
      }
      if (this.underlyingType.storageSlots === 1 && location.offset + this.underlyingType.storageBytes <= 32) {
        currentLocation.offset += this.underlyingType.storageBytes;
        if (currentLocation.offset + this.underlyingType.storageBytes > 32) {
          currentLocation.offset = 0;
          currentLocation.slot = '0x' + add(currentLocation.slot, 1).toString(16);
        }
      } else {
        currentLocation.slot = '0x' + add(currentLocation.slot, this.underlyingType.storageSlots).toString(16);
        currentLocation.offset = 0;
      }
    }
    return { value: ret, length: '0x' + size!.toString(16), type: this.typeName };
  }

  decodeFromMemoryInternal(offset: number, memory: string, skip: number | null) {
    const ret = [];
    let length = 0;
    if (this.arraySize === 'dynamic') {
      const lengthStr = memory.substr(2 * offset, 64);
      length = parseInt(lengthStr, 16);
      offset = offset + 32;
    }
    if (isNaN(length)) {
      return {
        error: '<decoding failed - length is NaN>',
        type: 'Error'
      };
    }
    if (!skip) {
      skip = 0;
    } else {
      offset = offset + (32 * skip);
    }
    let limit = length - skip;
    if (limit > 10) limit = 10;
    for (let k = 0; k < limit; k++) {
      const contentOffset = offset;
      ret.push(this.underlyingType.decodeFromMemory(contentOffset, memory));
      offset += 32;
    }
    return {
      value: ret,
      length: '0x' + length.toString(16),
      type: this.typeName,
      cursor: skip + limit,
      hasNext: length > (skip + limit)
    };
  }
}
