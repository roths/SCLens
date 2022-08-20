'use strict';
import { BN } from 'ethereumjs-util';
import { ethers } from 'ethers';
import { CompiledContract } from '../../../common/type';
import { StorageViewer } from '../../storage/storageViewer';
import { SolidityType } from '../decodeInfo';
import { toBN } from './util';

export abstract class RefType {
  // (storage ref| storage pointer| memory| calldata)
  storageType: string;
  storageSlots: number;
  storageBytes: number;
  typeName: string;
  basicType: string;
  underlyingType?: SolidityType;

  constructor(storageSlots: number, storageBytes: number, typeName: string, storageType: string) {
    this.storageType = storageType;
    this.storageSlots = storageSlots;
    this.storageBytes = storageBytes;
    this.typeName = typeName;
    this.basicType = 'RefType';
  }

  abstract decodeFromStorage(input1?: any, input2?: any): any;

  abstract decodeFromMemoryInternal(offset?: number, memory?: string, cursor?: any): any;

  /**
    * decode the type from the stack
    *
    * @param {Int} stackDepth - position of the type in the stack
    * @param {Array} stack - stack
    * @param {String} - memory
    * @param {Object} - storageResolver
    * @return {Object} decoded value
    */
  async decodeFromStack(stackDepth: number, stack: string[], memory: string, storageViewer: StorageViewer, calldata: string[], cursor: any, variableDetails: any): Promise<any> {
    if (stack.length - 1 < stackDepth) {
      return { error: '<decoding failed - stack underflow ' + stackDepth + '>', type: this.typeName };
    }
    let offset: string | BN | null | number = stack[stack.length - 1 - stackDepth];
    if (this.isInStorage()) {
      offset = toBN(offset);
      try {
        return await this.decodeFromStorage({ offset: 0, slot: offset }, storageViewer);
      } catch (e: any) {
        console.log(e);
        return { error: '<decoding failed - ' + e.message + '>', type: this.typeName };
      }
    } else if (this.isInMemory()) {
      offset = parseInt(offset, 16);
      return this.decodeFromMemoryInternal(offset, memory, cursor);
    } else if (this.isInCallData()) {
      return this._decodeFromCallData(variableDetails, calldata);
    } else {
      return { error: '<decoding failed - no decoder for ' + this.storageType + '>', type: this.typeName };
    }
  }

  _decodeFromCallData(variableDetails: any, calldatas: string[]): any {
    const calldata = calldatas.length > 0 ? calldatas[0] : '0x';
    const ethersAbi: any = new ethers.utils.Interface(variableDetails.abi);
    const fnSign = calldata.substr(0, 10);
    const decodedData = ethersAbi.decodeFunctionData(ethersAbi.getFunction(fnSign), calldata);
    const decodedValue = decodedData[variableDetails.name];
    const isArray = Array.isArray(decodedValue);
    if (isArray) {
      return this._decodeCallDataArray(decodedValue, this);
    }
    return {
      length: isArray ? '0x' + decodedValue.length.toString(16) : undefined,
      value: decodedValue,
      type: this.typeName
    };
  }

  _decodeCallDataArray(value: any, type: SolidityType): any {
    const isArray = Array.isArray(value);
    if (isArray) {
      value = value.map((el: any) => {
        return this._decodeCallDataArray(el, this.underlyingType!);
      });
      return {
        length: value.length.toString(16),
        value: value,
        type: type.typeName
      };
    } else {
      type = type as RefType;
      return {
        value: value.toString(),
        type: (type.underlyingType && type.underlyingType.typeName) || type.typeName
      };
    }
  }

  /**
    * decode the type from the memory
    *
    * @param {Int} offset - position of the ref of the type in memory
    * @param {String} memory - memory
    * @return {Object} decoded value
    */
  decodeFromMemory(offset: number, memory: string) {
    const offsetStr = memory.substr(2 * offset, 64);
    offset = parseInt(offsetStr, 16);
    return this.decodeFromMemoryInternal(offset, memory);
  }

  /**
    * current type defined in storage
    *
    * @return {Bool} - return true if the type is defined in the storage
    */
  private isInStorage() {
    return this.storageType.indexOf('storage') === 0;
  }

  /**
    * current type defined in memory
    *
    * @return {Bool} - return true if the type is defined in the memory
    */
  private isInMemory() {
    return this.storageType.indexOf('memory') === 0;
  }

  /**
    * current type defined in storage
    *
    * @return {Bool} - return true if the type is defined in the storage
    */
  private isInCallData() {
    return this.storageType.indexOf('calldata') === 0;
  }
}
