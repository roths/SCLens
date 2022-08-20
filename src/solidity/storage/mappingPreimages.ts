import Web3 from 'web3';
import { Storagelocation as StorageLocation } from '../solidity-decoder/decodeInfo';
import { sub } from '../solidity-decoder/types/util';
import { StorageMap } from '../../common/type';

/**
  * extract the mappings location from the storage
  * like { "<mapping_slot>" : { "<mapping-key1>": preimageOf1 }, { "<mapping-key2>": preimageOf2 }, ... }
  *
  * @param {Object} storage  - storage given by storage Viewer (basically a mapping hashedkey : {key, value})
  * @param {Array} corrections - used in case the calculated sha3 has been modifyed before SSTORE (notably used for struct in mapping).
  * @param {Function} callback  - calback
  * @return {Map} - solidity mapping location (e.g { "<mapping_slot>" : { "<mapping-key1>": preimageOf1 }, { "<mapping-key2>": preimageOf2 }, ... })
  */
export async function decodeMappingsKeys(web3: Web3, storage: StorageMap, corrections: StorageLocation[]) {
  const ret: { [key: string]: { [key: string]: string; }; } = {};
  if (!corrections.length) {
    corrections.push({ offset: 0, slot: 0 });
  }
  for (const hashedLoc in storage) {
    let preimage: string | null = null;
    try {
      const key = storage[hashedLoc].key;
      for (const k in corrections) {
        const corrected = sub(key, corrections[k].slot).toString(16);
        preimage = await getPreimage(web3, '0x' + corrected);
        if (preimage) {
          break;
        }
      }
    } catch (e) { } // eslint-disable-line no-empty
    if (preimage !== null) {
      // got preimage!
      // get mapping position (i.e. storage slot), its the last 32 bytes
      const slotByteOffset = preimage.length - 64;
      const mappingSlot = preimage.substr(slotByteOffset);
      const mappingKey = preimage.substr(0, slotByteOffset);
      if (!ret[mappingSlot]) {
        ret[mappingSlot] = {};
      }
      ret[mappingSlot][mappingKey] = preimage;
    }
  }
  return ret;
}

/**
  * Uses web3 to return preimage of a key
  *
  * @param {String} key  - key to retrieve the preimage of
  * @return {String} - preimage of the given key
  */
function getPreimage(web3: Web3, key: string) {
  return new Promise<string | null>((resolve, reject) => {
    (web3 as any).debug.preimage(key.indexOf('0x') === 0 ? key : '0x' + key, (error: any, preimage: string) => {
      if (error) {
        return resolve(null);
      }
      resolve(preimage);
    });
  });
}
