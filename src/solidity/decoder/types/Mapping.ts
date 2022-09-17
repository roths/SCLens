'use strict';
import { RefType } from './RefType';
import { normalizeHex } from './util';
import { toBuffer, setLengthLeft, keccak, BN, bufferToHex, addHexPrefix } from 'ethereumjs-util';
import { SolidityType, Storagelocation } from '../decodeInfo';
import { StorageViewer } from '../../storage/storageViewer';

export class Mapping extends RefType {
  keyType: SolidityType;
  valueType: SolidityType;
  initialDecodedState: { [key: string]: any; } | null;

  constructor(keyType: SolidityType, valueType: SolidityType, fullType: string) {
    super(1, 32, fullType, 'storage');
    this.keyType = keyType;
    this.valueType = valueType;
    this.initialDecodedState = null;
  }

  async decodeFromStorage(location: Storagelocation, storageViewer: StorageViewer) {
    const corrections = (this.valueType as any).members ? (this.valueType as any).members.map((value: any) => { return value.storagelocation; }) : [];
    if (!this.initialDecodedState) { // cache the decoded initial storage
      let mappingsInitialPreimages;
      try {
        mappingsInitialPreimages = await storageViewer.initialMappingsLocation(corrections);
        this.initialDecodedState = await this.decodeMappingsLocation(mappingsInitialPreimages, location, storageViewer);
      } catch (e: any) {
        return {
          value: e.message,
          type: this.typeName
        };
      }
    }
    const mappingPreimages = await storageViewer.mappingsLocation(corrections);
    let ret = await this.decodeMappingsLocation(mappingPreimages, location, storageViewer); // fetch mapping storage changes
    ret = Object.assign({}, this.initialDecodedState, ret); // merge changes
    return { value: ret, type: this.typeName };
  }

  decodeFromMemoryInternal(offset: number, memory: string) {
    // mappings can only exist in storage and not in memory
    // so this should never be called
    return { value: '', length: '0x0', type: this.typeName };
  }

  async decodeMappingsLocation(preimages: { [key: string]: { [key: string]: string; }; }, location: Storagelocation, storageViewer: StorageViewer) {
    const mapSlot = normalizeHex(bufferToHex(location.slot));
    if (!preimages[mapSlot]) {
      return {};
    }
    const ret: { [key: string]: any; } = {};
    for (const i in preimages[mapSlot]) {
      const mapLocation = getMappingLocation(i, location.slot);
      const globalLocation = {
        offset: location.offset,
        slot: mapLocation
      };
      ret[i] = await this.valueType.decodeFromStorage(globalLocation, storageViewer);
    }
    return ret;
  }
}

function getMappingLocation(key: string, position: string) {
  // mapping storage location decribed at http://solidity.readthedocs.io/en/develop/miscellaneous.html#layout-of-state-variables-in-storage
  // > the value corresponding to a mapping key k is located at keccak256(k . p) where . is concatenation.

  // key should be a hex string, and position an int
  const mappingK = toBuffer(addHexPrefix(key));
  let mappingP = toBuffer(addHexPrefix(position));
  mappingP = setLengthLeft(mappingP, 32);
  const mappingKeyBuf = concatTypedArrays(mappingK, mappingP);
  const mappingStorageLocation: Buffer = keccak(mappingKeyBuf);
  const mappingStorageLocationinBn: BN = new BN(mappingStorageLocation, 16);
  return mappingStorageLocationinBn;
}

function concatTypedArrays(a: any, b: any) { // a, b TypedArray of same type
  const c = new (a.constructor)(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}
