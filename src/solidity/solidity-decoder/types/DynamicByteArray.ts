'use strict';
import { extractHexValue, readFromStorage } from './util';
import { util } from '../../../common/utils';
import { BN } from 'ethereumjs-util';
import { RefType } from './RefType';
import { Storagelocation } from '../decodeInfo';
import { StorageViewer } from '../../storage/storageViewer';
const sha3256 = util.sha3_256;

export class DynamicByteArray extends RefType {
  constructor(location: string) {
    super(1, 32, 'bytes', location);
  }

  async decodeFromStorage(location: Storagelocation, storageViewer: StorageViewer) {
    let value = '0x0';
    try {
      value = await extractHexValue(location, storageViewer, this.storageBytes);
    } catch (e: any) {
      console.log(e);
      return { error: '<decoding failed - ' + e.message + '>', type: this.typeName };
    }
    const length = new BN(value, 16);
    if (length.testn(0)) {
      let dataPos = new BN(sha3256(location.slot).replace('0x', ''), 16);
      let ret = '';
      let currentSlot = '0x';
      try {
        currentSlot = await readFromStorage(dataPos.toBuffer(), storageViewer);
      } catch (e: any) {
        console.log(e);
        return { error: '<decoding failed - ' + e.message + '>', type: this.typeName };
      }
      while (length.gt(new BN(ret.length)) && ret.length < 32000) {
        currentSlot = currentSlot.replace('0x', '');
        ret += currentSlot;
        dataPos = dataPos.add(new BN(1));
        try {
          currentSlot = await readFromStorage(dataPos.toBuffer(), storageViewer);
        } catch (e: any) {
          console.log(e);
          return { error: '<decoding failed - ' + e.message + '>', type: this.typeName };
        }
      }
      return { value: '0x' + ret.replace(/(00)+$/, ''), length: '0x' + length.toString(16), type: this.typeName };
    } else {
      const size = parseInt(value.substr(value.length - 2, 2), 16) / 2;
      return { value: '0x' + value.substr(0, size * 2), length: '0x' + size.toString(16), type: this.typeName };
    }
  }

  decodeFromMemoryInternal(offset: number, memory: string) {
    offset = 2 * offset;
    const lengthStr = memory.substr(offset, 64);
    const length = 2 * parseInt(lengthStr, 16);
    return { length: '0x' + length.toString(16), value: '0x' + memory.substr(offset + 64, length), type: this.typeName };
  }
}
