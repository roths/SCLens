'use strict'
import { helpers } from '@remix-project/remix-lib';
import { StructLog } from '../web3_type';
const { ui } = helpers;

// vmTraceIndex has to point to a CALL, CODECALL, ...
export function resolveCalledAddress(vmTraceIndex: number, trace: StructLog[]) {
  const step = trace[vmTraceIndex];
  if (isCreateInstruction(step)) {
    return contractCreationToken(vmTraceIndex);
  } else if (isCallInstruction(step)) {
    const stack = step.stack; // callcode, delegatecall, ...
    return ui.normalizeHexAddress(stack[stack.length - 2]);
  }
  return null;
}

export function isCallInstruction(step: StructLog) {
  return ['CALL', 'STATICCALL', 'CALLCODE', 'CREATE', 'DELEGATECALL', 'CREATE2'].includes(step.op);
}

export function isCreateInstruction(step: StructLog) {
  return step.op === 'CREATE' || step.op === 'CREATE2';
}

export function isReturnInstruction(step: StructLog) {
  return step.op === 'RETURN';
}

export function isJumpDestInstruction(step: StructLog) {
  return step.op === 'JUMPDEST'
}

export function isStopInstruction(step: StructLog) {
  return step.op === 'STOP'
}

export function isRevertInstruction(step: StructLog) {
  return step.op === 'REVERT'
}

export function isSSTOREInstruction(step: StructLog) {
  return step.op === 'SSTORE'
}

export function isSHA3Instruction(step: StructLog) {
  return step.op === 'SHA3'
}

export function newContextStorage(step: StructLog) {
  return step.op === 'CREATE' || step.op === 'CALL' || step.op === 'CREATE2'
}

export function isCallToPrecompiledContract(index: number, trace: StructLog[]) {
  // if stack empty => this is not a precompiled contract
  const step = trace[index]
  if (isCallInstruction(step)) {
    return index + 1 < trace.length && trace[index + 1].stack.length !== 0
  }
  return false
}

export function contractCreationToken(index: number) {
  return '(Contract Creation - Step ' + index + ')';
}

export function isContractCreation(address: string) {
  return address.indexOf('(Contract Creation - Step') !== -1;
}
