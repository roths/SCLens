'use strict';
import { StorageViewer } from '../../storage/storageViewer';
import { Storagelocation } from '../decodeInfo';
import { DynamicByteArray } from './DynamicByteArray';

export class StringType extends DynamicByteArray {
  typeName;

  constructor(location: string) {
    super(location);
    this.typeName = 'string';
  }

  async decodeFromStorage(location: Storagelocation, storageViewer: StorageViewer) {
    let decoded: any = '0x';
    try {
      decoded = await super.decodeFromStorage(location, storageViewer);
    } catch (e: any) {
      console.log(e);
      return { error: '<decoding failed - ' + e.message + '>' };
    }
    return format(decoded);
  }

  async decodeFromStack(stackDepth: number, stack: string[], memory: string, storageViewer: StorageViewer, calldata: string[], cursor?: any, variableDetails?: any) {
    try {
      return await super.decodeFromStack(stackDepth, stack, memory, storageViewer, calldata, cursor, variableDetails);
    } catch (e) {
      console.log(e);
      return { error: '<decoding failed - ' + e.message + '>' };
    }
  }

  decodeFromMemoryInternal(offset: number, memory: string) {
    const decoded = super.decodeFromMemoryInternal(offset, memory);
    return format(decoded);
  }
}

function format(decoded: any) {
  if (decoded.error) {
    return decoded;
  }
  let value = decoded.value;
  value = value.replace('0x', '').replace(/(..)/g, '%$1');
  const ret: any = { length: decoded.length, raw: decoded.value, type: 'string' };
  try {
    ret.value = decodeURIComponent(value);
  } catch (e) {
    ret.error = 'Invalid UTF8 encoding';
    ret.raw = decoded.value;
  }
  return ret;
}
