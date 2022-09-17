'use strict';
import { util } from '../../common/utils';
import { Storagelocation } from '../decoder/decodeInfo';
import { TraceManager } from '../trace/traceManager';
import { decodeMappingsKeys } from './mappingPreimages';
import { StorageResolver } from './storageResolver';
import { Transaction } from 'web3-core';
import Web3 from 'web3';

export interface StorageChanges {
  [key: string]:
  { key: string, value: string; };
}
/**
   * easier access to the storage resolver
   * Basically one instance is created foreach execution step and foreach component that need it.
   * (TODO: one instance need to be shared over all the components)
   */
export class StorageViewer {
  context: { stepIndex: number, tx: Transaction, address: string; };
  storageResolver: StorageResolver;
  web3: Web3;
  initialMappingsLocationPromise: Promise<any> | null;
  currentMappingsLocationPromise: Promise<any> | null;
  storageChanges: StorageChanges;
  mappingsLocationChanges!: { [key: string]: { [key: string]: string; }; };

  constructor(_context: { stepIndex: number, tx: Transaction, address: string; }, _storageResolver: StorageResolver, _traceManager: TraceManager) {
    this.context = _context;
    this.storageResolver = _storageResolver;
    this.web3 = this.storageResolver.web3;
    this.initialMappingsLocationPromise = null;
    this.currentMappingsLocationPromise = null;
    this.storageChanges = _traceManager.accumulateStorageChanges(this.context.stepIndex, this.context.address, {});
  }

  /**
    * return the storage for the current context (address and vm trace index)
    * by default now returns the range 0 => 1000
    *
    * @param {Function} - callback - contains a map: [hashedKey] = {key, hashedKey, value}
    */
  storageRange() {
    return new Promise((resolve, reject) => {
      this.storageResolver.storageRange(this.context.tx, this.context.stepIndex, this.context.address).then((storage) => {
        resolve(Object.assign({}, storage, this.storageChanges));
      }).catch(reject);
    });
  }

  /**
    * return a slot value for the current context (address and vm trace index)
    * @param {String} - slot - slot key (not hashed key!)
    * @param {Function} - callback - {key, hashedKey, value} -
    */
  storageSlot(slot: string, callback: any) {
    const hashed = util.sha3_256(slot);
    if (this.storageChanges[hashed]) {
      return callback(null, this.storageChanges[hashed]);
    }
    this.storageResolver.storageSlot(hashed, this.context.tx, this.context.stepIndex, this.context.address).then((storage) => {
      callback(null, storage);
    }).catch(callback);
  }

  /**
    * return True if the storage at @arg address is complete
    *
    * @param {String} address  - contract address
    * @return {Bool} - return True if the storage at @arg address is complete
    */
  isComplete(address: string) {
    return this.storageResolver.isComplete(address);
  }

  /**
    * return all the possible mappings locations for the current context (cached) do not return state changes during the current transaction
    *
    * @param {Array} corrections - used in case the calculated sha3 has been modifyed before SSTORE (notably used for struct in mapping).
    */
  async initialMappingsLocation(corrections: Storagelocation[]) {
    if (!this.initialMappingsLocationPromise) {
      this.initialMappingsLocationPromise = this.storageResolver.initialPreimagesMappings(this.context.tx, this.context.stepIndex, this.context.address, corrections);
    }
    return this.initialMappingsLocationPromise;
  }

  /**
    * return all the possible mappings locations for the current context (cached) and current mapping slot. returns state changes during the current transaction
    *
    * @param {Array} corrections - used in case the calculated sha3 has been modifyed before SSTORE (notably used for struct in mapping).
    */
  async mappingsLocation(corrections: Storagelocation[]): Promise<{ [key: string]: { [key: string]: string; }; }> {
    if (!this.currentMappingsLocationPromise) {
      this.currentMappingsLocationPromise = new Promise((resolve, reject) => {
        this.extractMappingsLocationChanges(this.storageChanges, corrections).then(resolve).catch(reject);
      });
    }
    return this.currentMappingsLocationPromise;
  }

  /**
    * retrieve mapping location changes from the storage changes.
    * @param {Map} storageChanges
    * @param {Array} corrections - used in case the calculated sha3 has been modifyed before SSTORE (notably used for struct in mapping).
    */
  async extractMappingsLocationChanges(storageChanges: StorageChanges, corrections: Storagelocation[]) {
    if (this.mappingsLocationChanges) {
      return this.mappingsLocationChanges;
    }
    const mappings = await decodeMappingsKeys(this.web3, storageChanges, corrections);
    this.mappingsLocationChanges = mappings;
    return this.mappingsLocationChanges;
  }
}
