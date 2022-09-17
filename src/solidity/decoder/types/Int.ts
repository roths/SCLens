'use strict';
import { extractHexByteSlice, decodeIntFromHex } from './util';
import { ValueType } from './ValueType';

export class Int extends ValueType {
  constructor(storageBytes: number) {
    super(1, storageBytes, 'int' + storageBytes * 8);
  }

  decodeValue(value: string) {
    value = extractHexByteSlice(value, this.storageBytes, 0);
    return decodeIntFromHex(value, this.storageBytes, true);
  }
}
