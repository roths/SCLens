'use strict';
import { helpers } from '@remix-project/remix-lib';
import { StructLog } from '../common/type';
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

export function isCallInstruction(traceLog: StructLog) {
  return ['CALL', 'STATICCALL', 'CALLCODE', 'CREATE', 'DELEGATECALL', 'CREATE2'].includes(traceLog.op);
}

export function isNewContextStorageInstruction(traceLog: StructLog) {
  return ['CREATE' , 'CALL' , 'CREATE2'].includes(traceLog.op);
}

export function isCreateInstruction(traceLog: StructLog) {
  return traceLog.op === 'CREATE' || traceLog.op === 'CREATE2';
}

export function isReturnInstruction(traceLog: StructLog) {
  return traceLog.op === 'RETURN';
}

export function isJumpDestInstruction(traceLog: StructLog) {
  return traceLog.op === 'JUMPDEST';
}

export function isStopInstruction(traceLog: StructLog) {
  return traceLog.op === 'STOP';
}

export function isRevertInstruction(traceLog: StructLog) {
  return traceLog.op === 'REVERT';
}

export function isSSTOREInstruction(traceLog: StructLog) {
  return traceLog.op === 'SSTORE';
}

export function isSHA3Instruction(traceLog: StructLog) {
  return traceLog.op === 'SHA3';
}

export function isCallToPrecompiledContract(index: number, trace: StructLog[]) {
  // if stack empty => this is not a precompiled contract
  const traceLog = trace[index];
  if (isCallInstruction(traceLog)) {
    return index + 1 < trace.length && trace[index + 1].stack.length !== 0;
  }
  return false;
}

export function contractCreationToken(index: number) {
  return '(Contract Creation - Step ' + index + ')';
}

export function isContractCreation(address: string) {
  return address.indexOf('(Contract Creation - Step') !== -1;
}
