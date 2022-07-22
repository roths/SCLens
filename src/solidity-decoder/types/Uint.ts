'use strict'
import { extractHexByteSlice, decodeIntFromHex } from './util'
import { ValueType } from './ValueType'

export class Uint extends ValueType {
  constructor (storageBytes: number) {
    super(1, storageBytes, 'uint' + storageBytes * 8)
  }

  decodeValue (value: string) {
    value = extractHexByteSlice(value, this.storageBytes, 0)
    return decodeIntFromHex(value, this.storageBytes, false)
  }
}
