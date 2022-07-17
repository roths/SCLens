'use strict'
import { BN, bufferToHex, unpadHexString } from 'ethereumjs-util'
import { VariableDeclarationAstNode } from '../../common/type'
import { StorageViewer } from '../../storage/storageViewer'
import { Storagelocation } from '../decodeInfo'

export function decodeIntFromHex (value: any, byteLength: number, signed: boolean) {
  let bigNumber = new BN(value, 16)
  if (signed) {
    bigNumber = bigNumber.fromTwos(8 * byteLength)
  }
  return bigNumber.toString(10)
}

export function readFromStorage (slot: Buffer, storageViewer: StorageViewer): Promise<string> {
  const hexSlot = '0x' + normalizeHex(bufferToHex(slot))
  return new Promise((resolve, reject) => {
    storageViewer.storageSlot(hexSlot, (error: any, slot: any) => {
      if (error) {
        return reject(error)
      }
      if (!slot) {
        slot = { key: slot, value: '' }
      }
      return resolve(normalizeHex(slot.value))
    })
  })
}

/**
 * @returns a hex encoded byte slice of length @arg byteLength from inside @arg slotValue.
 *
 * @param {String} slotValue  - hex encoded value to extract the byte slice from
 * @param {Int} byteLength  - Length of the byte slice to extract
 * @param {Int} offsetFromLSB  - byte distance from the right end slot value to the right end of the byte slice
 */
export function extractHexByteSlice (slotValue: string, byteLength: number, offsetFromLSB: number) {
  const offset = slotValue.length - 2 * offsetFromLSB - 2 * byteLength
  return slotValue.substr(offset, 2 * byteLength)
}

/**
 * @returns a hex encoded storage content at the given @arg location. it does not have Ox prefix but always has the full length.
 *
 * @param {Object} location  - object containing the slot and offset of the data to extract.
 * @param {Object} storageViewer  - storage resolver
 * @param {Int} byteLength  - Length of the byte slice to extract
 */
export async function extractHexValue (location: Storagelocation, storageViewer: StorageViewer, byteLength: number) {
  let slotvalue
  try {
    slotvalue = await readFromStorage(location.slot, storageViewer)
  } catch (e) {
    return ''
  }
  return extractHexByteSlice(slotvalue, byteLength, location.offset)
}

export function toBN (value: any) {
  if (value instanceof BN) {
    return value
  } else if (value.match && value.match(/^(0x)?([a-f0-9]*)$/)) {
    value = unpadHexString(value)
    value = new BN(value === '' ? '0' : value, 16)
  } else if (!isNaN(value)) {
    value = new BN(value)
  }
  return null
}

export function add (value1: any, value2: any) {
  return toBN(value1)!.add(toBN(value2)!)
}

export function sub (value1: any, value2: any) {
  return toBN(value1)!.sub(toBN(value2)!)
}

export function removeLocation (type: string) {
  return type.replace(/( storage ref| storage pointer| memory| calldata)/g, '')
}

export function extractLocation (type: string) {
  const match = type.match(/( storage ref| storage pointer| memory| calldata)?$/)
  if (match && match[1] !== '') {
    return match[1].trim()
  }
  return null
}

export function extractLocationFromAstVariable (node: VariableDeclarationAstNode) {
  if (node.storageLocation !== 'default') {
    return node.storageLocation
  } else if (node.stateVariable) {
    return 'storage'
  }
  return 'default' // local variables => storage, function parameters & return values => memory, state => storage
}

export function normalizeHex (hex: string): string {
  hex = hex.replace('0x', '')
  if (hex.length < 64) {
    return (new Array(64 - hex.length + 1).join('0')) + hex
  }
  return hex
}
