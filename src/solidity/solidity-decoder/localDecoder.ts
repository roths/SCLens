'use strict';

import { SourceLocation } from "../code/codeManager";
import { StorageViewer } from "../storage/storageViewer";
import { InternalCallTree } from "./internalCallTree";

export async function solidityLocals(vmtraceIndex: number, internalTreeCall: InternalCallTree,
  stack: string[],
  memory: string | string[],
  storageViewer: StorageViewer,
  calldata: string[],
  currentSourceLocation: SourceLocation,
  cursor: any) {
  const scope = internalTreeCall.findScope(vmtraceIndex);
  if (!scope) {
    const error = { message: 'Can\'t display locals. reason: compilation result might not have been provided' };
    throw error;
  }
  const locals: {
    [x: string]: any;
  } = {};
  memory = formatMemory(memory);
  let anonymousIncr = 1;
  for (const local in scope.locals) {
    const variable = scope.locals[local];
    // fix: can not lookup temp var in loop expression 
    // if (variable.stackDepth < stack.length && variable.sourceLocation.start <= currentSourceLocation.start) {
    if (variable.stackDepth < stack.length) {
      let name = variable.name;
      if (name.indexOf('$') !== -1) {
        name = '<' + anonymousIncr + '>';
        anonymousIncr++;
      }
      try {
        locals[name] = await variable.type.decodeFromStack(variable.stackDepth, stack, memory, storageViewer, calldata, cursor, variable);
      } catch (e: any) {
        console.log(e);
        locals[name] = { error: '<decoding failed - ' + e.message + '>' };
      }
    }
  }
  return locals;
}

function formatMemory(memory: string | string[]): string {
  if (memory instanceof Array) {
    memory = memory.join('').replace(/0x/g, '');
  }
  return memory;
}
