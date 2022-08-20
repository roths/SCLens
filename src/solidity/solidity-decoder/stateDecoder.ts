import { ComplitionSources, VariableDeclarationAstNode } from '../../common/type';
import { StorageViewer } from '../storage/storageViewer';
import { extractStatesDefinitions } from './astHelper';
import { computeOffsets, TypesOffsets } from './decodeInfo';

/**
  * decode the contract state storage
  *
  * @param {Array} storage location  - location of all state variables
  * @param {Object} storageResolver  - resolve storage queries
  * @return {Map} - decoded state variable
  */
export async function decodeState(stateVars: TypesOffsets[], storageViewer: StorageViewer) {
  const ret: { [key: string]: any; } = {};
  for (const k in stateVars) {
    const stateVar = stateVars[k];
    try {
      const decoded = await stateVar.type.decodeFromStorage(stateVar.storagelocation, storageViewer);
      decoded.constant = stateVar.constant;
      decoded.immutable = stateVar.immutable;
      if (decoded.constant) {
        decoded.value = '<constant>';
      }
      if (decoded.immutable) {
        decoded.value = '<immutable>';
      }
      ret[stateVar.name] = decoded;
    } catch (e: any) {
      console.log(e);
      ret[stateVar.name] = { error: '<decoding failed - ' + e.message + '>' };
    }
  }
  return ret;
}

/**
  * return all storage location variables of the given @arg contractName
  *
  * @param {String} contractName  - name of the contract
  * @param {Object} sourcesList  - sources list
  * @return {Object} - return the location of all contract variables in the storage
  */
export function extractStateVariables(contractName: string, sourcesList: ComplitionSources) {
  const states = extractStatesDefinitions(sourcesList, null);
  if (!states[contractName]) {
    return [];
  }
  const types = states[contractName]!.stateVariables;
  const offsets = computeOffsets(types as VariableDeclarationAstNode[], states, contractName, 'storage');
  if (!offsets) {
    return []; // TODO should maybe return an error
  }
  return offsets.typesOffsets;
}

/**
  * return the state of the given @a contractName as a json object
  *
  * @param {Object} storageResolver  - resolve storage queries
  * @param {astList} astList  - AST nodes of all the sources
  * @param {String} contractName  - contract for which state var should be resolved
  * @return {Map} - return the state of the contract
  */
export async function solidityState(storageViewer: StorageViewer, astList: ComplitionSources, contractName: string) {
  const stateVars = extractStateVariables(contractName, astList);
  try {
    return await decodeState(stateVars, storageViewer);
  } catch (e: any) {
    return { error: '<decoding failed - ' + e.message + '>' };
  }
}
