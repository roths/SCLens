'use strict';
import { EnumDefinitionAstNode } from '../../common/type';
import { ValueType } from './ValueType';

export class Enum extends ValueType {
  enumDef: EnumDefinitionAstNode;

  constructor(enumDef: EnumDefinitionAstNode) {
    let storageBytes = 0;
    let length = enumDef.members.length;
    while (length > 1) {
      length = length / 256;
      storageBytes++;
    }
    super(1, storageBytes, 'enum');
    this.enumDef = enumDef;
  }

  decodeValue(value: string) {
    if (!value) {
      return this.enumDef.members[0].name;
    }
    const valueNumber = parseInt(value, 16);
    if (this.enumDef.members.length > valueNumber) {
      return this.enumDef.members[valueNumber].name;
    }
    return 'INVALID_ENUM<' + valueNumber + '>';
  }
}
