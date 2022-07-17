'use strict'
import { ValueType } from './ValueType'

export class FunctionType extends ValueType {
  constructor () {
    super(1, 8, 'function')
  }

  decodeValue (value: string) {
    return 'at program counter ' + value
  }
}
