'use strict';
import { add } from './util';
import { RefType } from './RefType';
import { Mapping } from './Mapping';
import { Storagelocation, TypesOffsets } from '../decodeInfo';
import { StorageViewer } from '../../storage/storageViewer';

export class Struct extends RefType {
  members: TypesOffsets[];

  constructor(memberDetails: { members: TypesOffsets[], storageSlots: number; }, location: string, fullType: string) {
    super(memberDetails.storageSlots, 32, 'struct ' + fullType, location);
    this.members = memberDetails.members;
  }

  async decodeFromStorage(location: Storagelocation, storageResolver: StorageViewer) {
    const ret: { [key: string]: any; } = {};
    for (const item of this.members) {
      const globalLocation = {
        offset: location.offset + item.storagelocation.offset,
        slot: add(location.slot, item.storagelocation.slot)
      };
      try {
        ret[item.name] = await item.type.decodeFromStorage(globalLocation, storageResolver);
      } catch (e: any) {
        console.log(e);
        ret[item.name] = { error: '<decoding failed - ' + e.message + '>' };
      }
    }
    return { value: ret, type: this.typeName };
  }

  decodeFromMemoryInternal(offset: number, memory: string) {
    const ret: any = {};
    this.members.map((item, i) => {
      const contentOffset = offset;
      const member = item.type.decodeFromMemory(contentOffset, memory);
      ret[item.name] = member;
      if (!(item.type instanceof Mapping)) offset += 32;
    });
    return { value: ret, type: this.typeName };
  }
}
