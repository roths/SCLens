'use strict';
import { Transaction } from 'web3-core';
import Web3 from 'web3';
import { isContractCreation } from '../trace/traceHelper';
import { decodeMappingsKeys } from './mappingPreimages';
import { Storage, StorageMap, StorageRangeResult } from '../common/type';
import { Storagelocation } from '../solidity-decoder/decodeInfo';

/**
  * Basically one instance is created for one debugging session.
  * (TODO: one instance need to be shared over all the components)
  */
export class StorageResolver {
  storageByAddress: {
    [key: string]: {
      storage?: StorageMap,
      complete?: boolean;
    };
  };
  preimagesMappingByAddress: {
    [key: string]: { [key: string]: { [key: string]: string; }; };
  };
  maxSize: number;
  web3: Web3;
  zeroSlot: string;

  constructor(web3: Web3) {
    this.storageByAddress = {};
    this.preimagesMappingByAddress = {};
    this.maxSize = 100;
    this.web3 = web3;
    this.zeroSlot = '0x0000000000000000000000000000000000000000000000000000000000000000';
  }

  /**
   * returns the storage for the given context (address and vm trace index)
   * returns the range 0x0 => this.maxSize
   *
   * @param {Object} - tx - transaction
   * @param {Int} - stepIndex - Index of the stop in the vm trace
   * @param {String} - address - lookup address
   * @param {Function} - callback - contains a map: [hashedKey] = {key, hashedKey, value}
   */
  storageRange(tx: Transaction, stepIndex: number, address: string) {
    return this.storageRangeInternal(this, this.zeroSlot, tx, stepIndex, address);
  }

  /**
   * compute the mappgings type locations for the current address (cached for a debugging session)
   * note: that only retrieve the first 100 items.
   *
   * @param {Object} tx
   * @param {Int} stepIndex
   * @param {Object} address  - storage
   * @param {Array} corrections - used in case the calculated sha3 has been modifyed before SSTORE (notably used for struct in mapping).
   * @return {Function} - callback
   */
  async initialPreimagesMappings(tx: Transaction, stepIndex: number, address: string, corrections: Storagelocation[]) {
    if (this.preimagesMappingByAddress[address]) {
      return this.preimagesMappingByAddress[address];
    }
    const storage = await this.storageRange(tx, stepIndex, address);
    const mappings = await decodeMappingsKeys(this.web3, storage, corrections);
    this.preimagesMappingByAddress[address] = mappings;
    return mappings;
  }

  /**
   * return a slot value for the given context (address and vm trace index)
   *
   * @param {String} - slot - slot key
   * @param {Object} - tx - transaction
   * @param {Int} - stepIndex - Index of the stop in the vm trace
   * @param {String} - address - lookup address
   * @param {Function} - callback - {key, hashedKey, value} -
   */
  async storageSlot(slot: string, tx: Transaction, stepIndex: number, address: string) {
    const storage = await this.storageRangeInternal(this, slot, tx, stepIndex, address);
    return (storage[slot] !== undefined ? storage[slot] : null);
  }

  /**
   * return True if the storage at @arg address is complete
   *
   * @param {String} address  - contract address
   * @return {Bool} - return True if the storage at @arg address is complete
   */
  isComplete(address: string) {
    return this.storageByAddress[address] && this.storageByAddress[address].complete;
  }

  /**
   * retrieve the storage and ensure at least @arg slot is cached.
   * - If @arg slot is already cached, the storage will be returned from the cache
   *   even if the next 1000 items are not in the cache.
   * - If @arg slot is not cached, the corresponding value will be resolved and the next 1000 slots.
   */
  async storageRangeInternal(self: StorageResolver, slotKey: string, tx: Transaction, stepIndex: number, address: string): Promise<StorageMap> {
    const cached = this.fromCache(self, address);
    if (cached && cached.storage![slotKey]) { // we have the current slot in the cache and maybe the next 1000...
      return cached.storage!;
    }
    const result = await this.storageRangeWeb3Call(tx, address, slotKey, self.maxSize);
    const storage: StorageMap = result?.storage ?? {};
    const nextKey = result?.nextKey ?? null;
    if (!storage[slotKey] && slotKey !== self.zeroSlot) { // we don't cache the zero slot (could lead to inconsistency)
      storage[slotKey] = { key: slotKey, value: self.zeroSlot };
    }
    self.toCache(self, address, storage);
    if (slotKey === self.zeroSlot && !nextKey) { // only working if keys are sorted !!
      self.storageByAddress[address].complete = true;
    }
    return storage;
  }

  /**
   * retrieve the storage from the cache. if @arg slot is defined, return only the desired slot, if not return the entire known storage
   *
   * @param {String} address  - contract address
   * @return {String} - either the entire known storage or a single value
   */
  fromCache(self: StorageResolver, address: string) {
    if (!self.storageByAddress[address]) {
      return null;
    }
    return self.storageByAddress[address];
  }

  /**
   * store the result of `storageRangeAtInternal`
   *
   * @param {String} address  - contract address
   * @param {Object} storage  - result of `storageRangeAtInternal`, contains {key, hashedKey, value}
   */
  toCache(self: StorageResolver, address: string, storage: StorageMap) {
    if (!self.storageByAddress[address]) {
      self.storageByAddress[address] = {};
    }
    self.storageByAddress[address].storage = Object.assign(self.storageByAddress[address].storage || {}, storage);
  }

  storageRangeWeb3Call(tx: Transaction, address: string, start: string, maxSize: number): Promise<StorageRangeResult | null> {
    return new Promise((resolve, reject) => {
      if (isContractCreation(address)) {
        resolve(null);
      } else {
        (this.web3 as any).debug.storageRangeAt(
          tx.blockHash, tx.transactionIndex,
          address,
          start,
          Web3.utils.toHex(maxSize),
          (error: any, result: StorageRangeResult) => {
            if (error) {
              reject(error);
            } else if (result.storage) {
              resolve(result);
            } else {
              reject(new Error('the storage has not been provided'));
            }
          });
      }
    });
  }
}
