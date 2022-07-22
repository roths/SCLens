'use strict';
import { AstWalker } from '@remix-project/remix-astwalker';
import { util } from '@remix-project/remix-lib';
import { TraceManager } from '../trace/traceManager';
import { StructLog } from '../common/type';
// import { SourceLocationTracker } from '../source/sourceLocationTracker'
// import { EventManager } from '../eventManager'
import { parseType } from './decodeInfo';
import { SolidityProxy } from './solidityProxy';
import { isContractCreation, isCallInstruction, isCreateInstruction, isJumpDestInstruction } from '../trace/traceHelper';
import { extractLocationFromAstVariable } from '../util';
import { CodeManager, SourceLocation } from '../code/codeManager';
import { GeneratedSource } from '../common/type';

/**
 * Tree representing internal jump into function.
 * Triggers `callTreeReady` event when tree is ready
 * Triggers `callTreeBuildFailed` event when tree fails to build
 */
export class InternalCallTree {
  includeLocalVariables;
  // event
  solidityProxy: SolidityProxy;
  traceManager: TraceManager;
  codeManager: CodeManager;
  scopes: any;
  scopeStarts: any;
  functionCallStack: any;
  functionDefinitionsByScope: any;
  variableDeclarationByFile: any;
  functionDefinitionByFile: any;
  astWalker!: AstWalker;
  reducedTrace: any;

  /**
    * constructor
    *
    * @param {Object} debuggerEvent  - event declared by the debugger (EthDebugger)
    * @param {Object} traceManager  - trace manager
    * @param {Object} solidityProxy  - solidity proxy
    * @param {Object} codeManager  - code manager
    * @param {Object} opts  - { includeLocalVariables, debugWithGeneratedSources }
    */
  constructor(traceManager: TraceManager, solidityProxy: SolidityProxy, codeManager: CodeManager) {
    this.includeLocalVariables = true;
    // this.debugWithGeneratedSources = false
    // this.event = new EventManager()
    this.solidityProxy = solidityProxy;
    this.traceManager = traceManager;
    this.codeManager = codeManager;
    // this.sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: true })
  }

  newTraceLoaded() {
    this.reset();
    if (!this.solidityProxy.loaded()) {
      console.log('callTreeBuildFailed', ['compilation result not loaded. Cannot build internal call tree']);
    } else {
      // each recursive call to buildTree represent a new context (either call, delegatecall, internal function)
      const calledAddress = this.traceManager.getCurrentCalledAddressAt(0);
      const isCreation = isContractCreation(calledAddress!);
      buildTree(this, 0, '', true, isCreation).then((result: any) => {
        if (result.error) {
          console.log('callTreeBuildFailed', [result.error]);
          // this.event.trigger('callTreeBuildFailed', [result.error])
        } else {
          createReducedTrace(this, this.traceManager.getLength() - 1);
          console.log('callTreeReady', [this.scopes, this.scopeStarts]);
          // test
          this.solidityProxy.extractStateVariables("Storage");
          for (let index = 0; index < this.traceManager.getLength(); index++) {
            const scope = this.findScope(index);
            if (Object.keys(scope.locals).length > 0) {
              // console.log("find local!")
              // console.log(scope)
            }
            // console.log(this.findScope(index))
          }
          console.log(this.functionCallStack);
          // this.event.trigger('callTreeReady', [this.scopes, this.scopeStarts])
        }
      }, (reason: any) => {
        console.log('analyzing trace falls ' + reason);
        // this.event.trigger('callTreeNotReady', [reason])
      });
    }
  }

  /**
    * reset tree
    *
    */
  reset() {
    /*
      scopes: map of scopes defined by range in the vmtrace {firstStep, lastStep, locals}.
      Keys represent the level of deepness (scopeId)
      scopeId : <currentscope_id>.<sub_scope_id>.<sub_sub_scope_id>
    */
    this.scopes = {};
    /*
      scopeStart: represent start of a new scope. Keys are index in the vmtrace, values are scopeId
    */
    // this.sourceLocationTracker.clearCache()
    this.functionCallStack = [];
    this.functionDefinitionsByScope = {};
    this.scopeStarts = {};
    this.variableDeclarationByFile = {};
    this.functionDefinitionByFile = {};
    this.astWalker = new AstWalker();
    this.reducedTrace = [];
  }

  /**
    * find the scope given @arg vmTraceIndex
    *
    * @param {Int} vmtraceIndex  - index on the vm trace
    */
  findScope(vmtraceIndex: number) {
    let scopeId = this.findScopeId(vmtraceIndex);
    if (scopeId !== '' && !scopeId) return null;
    let scope = this.scopes[scopeId];
    while (scope.lastStep && scope.lastStep < vmtraceIndex && scope.firstStep > 0) {
      scopeId = this.parentScope(scopeId);
      scope = this.scopes[scopeId];
    }
    return scope;
  }

  parentScope(scopeId: string) {
    if (scopeId.indexOf('.') === -1) return '';
    return scopeId.replace(/(\.\d+)$/, '');
  }

  findScopeId(vmtraceIndex: number) {
    const scopes = Object.keys(this.scopeStarts);
    if (!scopes.length) return null;
    const scopeStart = util.findLowerBoundValue(vmtraceIndex, scopes);
    return this.scopeStarts[scopeStart];
  }

  retrieveFunctionsStack(vmtraceIndex: number) {
    const scope = this.findScope(vmtraceIndex);
    if (!scope) return [];
    let scopeId = this.scopeStarts[scope.firstStep];
    const functions: any[] = [];
    if (!scopeId) {
      return functions;
    }
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i += 1;
      if (i > 1000) throw new Error('retrieFunctionStack: recursion too deep');
      const functionDefinition = this.functionDefinitionsByScope[scopeId];
      if (functionDefinition !== undefined) {
        functions.push(functionDefinition);
      }
      const parent = this.parentScope(scopeId);
      if (!parent) break;
      else scopeId = parent;
    }
    return functions;
  }

  async extractSourceLocation(step: number): Promise<SourceLocation | null> {
    try {
      const address = this.traceManager.getCurrentCalledAddressAt(step);
      // console.log("try to getSourceLocationFromVMTraceIndex")
      const location = await this.codeManager.getSourceLocationByVMTraceIndex(address!, step, this.solidityProxy.contracts);
      return location;
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve sourcelocation for step ' + step + ' ' + error);
    }
  }

  async extractValidSourceLocation(step: number) {
    try {
      const address = this.traceManager.getCurrentCalledAddressAt(step);
      console.log("try to getValidSourceLocationFromVMTraceIndex");
      const location = await this.codeManager.getValidSourceLocationByVMTraceIndex(address, step, this.solidityProxy.contracts);
      return location;
      return {};
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve valid sourcelocation for step ' + step + ' ' + error);
    }
  }
}

async function buildTree(tree: InternalCallTree, step: number, scopeId: string, isExternalCall: boolean, isCreation: boolean): Promise<any> {
  let subScope = 1;
  tree.scopeStarts[step] = scopeId;
  tree.scopes[scopeId] = { firstStep: step, locals: {}, isCreation };

  function callDepthChange(tree: InternalCallTree, step: number) {
    if (step + 1 < tree.traceManager.getLength()) {
      return tree.traceManager.getTraceLog(step).depth !== tree.traceManager.getTraceLog(step + 1).depth;
    }
    return false;
  }

  function includedSource(source, included) {
    return (included.start !== -1 &&
      included.length !== -1 &&
      included.file !== -1 &&
      included.start >= source.start &&
      included.start + included.length <= source.start + source.length &&
      included.file === source.file);
  }

  let currentSourceLocation: SourceLocation | null = {
    start: -1,
    length: -1,
    file: -1,
    jump: "-",
    modifierDepth: 0
  };

  let previousSourceLocation = currentSourceLocation;
  while (step < tree.traceManager.getLength()) {
    let sourceLocation: SourceLocation | null = null;
    let newLocation = false;
    try {
      sourceLocation = await tree.extractSourceLocation(step);
      if (!includedSource(sourceLocation, currentSourceLocation)) {
        tree.reducedTrace.push(step);
        currentSourceLocation = sourceLocation;
        newLocation = true;
      }
    } catch (e) {
      return { outStep: step, error: 'InternalCallTree - Error resolving source location. ' + step + ' ' + e };
    }
    if (!sourceLocation) {
      return { outStep: step, error: 'InternalCallTree - No source Location. ' + step };
    }
    const isCallInstrn = isCallInstruction(tree.traceManager.getTraceLog(step));
    const isCreateInstrn = isCreateInstruction(tree.traceManager.getTraceLog(step));
    // we are checking if we are jumping in a new CALL or in an internal function
    if (isCallInstrn || sourceLocation.jump === 'i') {
      try {
        const externalCallResult = await buildTree(tree, step + 1, scopeId === '' ? subScope.toString() : scopeId + '.' + subScope, isCallInstrn, isCreateInstrn);
        if (externalCallResult.error) {
          return { outStep: step, error: 'InternalCallTree - ' + externalCallResult.error };
        } else {
          step = externalCallResult.outStep;
          subScope++;
        }
      } catch (e: any) {
        return { outStep: step, error: 'InternalCallTree - ' + e.message };
      }
    } else if ((isExternalCall && callDepthChange(tree, step)) || (!isExternalCall && sourceLocation.jump === 'o')) {
      // if not, we might be returning from a CALL or internal function. This is what is checked here.
      tree.scopes[scopeId].lastStep = step;
      return { outStep: step + 1 };
    } else {
      // if not, we are in the current scope.
      // We check in `includeVariableDeclaration` if there is a new local variable in scope for this specific `step`
      if (tree.includeLocalVariables) {
        await includeVariableDeclaration(tree, step, sourceLocation, scopeId, newLocation, previousSourceLocation);
      }
      previousSourceLocation = sourceLocation;
      step++;
    }
  }
  return { outStep: step };
}

// the reduced trace contain an entry only if that correspond to a new source location
function createReducedTrace(tree, index) {
  tree.reducedTrace.push(index);
}

function getGeneratedSources(tree, scopeId, contractObj) {
  if (tree.debugWithGeneratedSources && contractObj && tree.scopes[scopeId]) {
    return tree.scopes[scopeId].isCreation ? contractObj.contract.evm.bytecode.generatedSources : contractObj.contract.evm.deployedBytecode.generatedSources;
  }
  return null;
}

async function includeVariableDeclaration(tree, step, sourceLocation, scopeId, newLocation, previousSourceLocation) {
  const contractObj = await tree.solidityProxy.contractObjectAt(step);
  let states = null;
  const generatedSources = getGeneratedSources(tree, scopeId, contractObj);
  const variableDeclarations = resolveVariableDeclaration(tree, sourceLocation, generatedSources);
  // using the vm trace step, the current source location and the ast,
  // we check if the current vm trace step target a new ast node of type VariableDeclaration
  // that way we know that there is a new local variable from here.
  if (variableDeclarations && variableDeclarations.length) {
    for (const variableDeclaration of variableDeclarations) {
      if (variableDeclaration && !tree.scopes[scopeId].locals[variableDeclaration.name]) {
        try {
          const stack = tree.traceManager.getStackAt(step);
          // the stack length at this point is where the value of the new local variable will be stored.
          // so, either this is the direct value, or the offset in memory. That depends on the type.
          if (variableDeclaration.name !== '') {
            states = tree.solidityProxy.extractStatesDefinitions();
            let location = extractLocationFromAstVariable(variableDeclaration);
            location = location === 'default' ? 'storage' : location;
            // we push the new local variable in our tree
            tree.scopes[scopeId].locals[variableDeclaration.name] = {
              name: variableDeclaration.name,
              type: parseType(variableDeclaration.typeDescriptions.typeString, states, contractObj.name, location),
              stackDepth: stack.length,
              sourceLocation: sourceLocation
            };
          }
        } catch (error) {
          console.log(error);
        }
      }
    }
  }

  // we check here if we are at the beginning inside a new function.
  // if that is the case, we have to add to locals tree the inputs and output params
  const functionDefinition = resolveFunctionDefinition(tree, previousSourceLocation, generatedSources);
  if (!functionDefinition) return;

  const previousIsJumpDest2 = isJumpDestInstruction(tree.traceManager.getTraceLog[step - 2]);
  const previousIsJumpDest1 = isJumpDestInstruction(tree.traceManager.getTraceLog[step - 1]);
  const isConstructor = functionDefinition.kind === 'constructor';
  if (newLocation && (previousIsJumpDest1 || previousIsJumpDest2 || isConstructor)) {
    tree.functionCallStack.push(step);
    const functionDefinitionAndInputs = { functionDefinition, inputs: [] };
    // means: the previous location was a function definition && JUMPDEST
    // => we are at the beginning of the function and input/output are setup

    try {
      const stack = tree.traceManager.getStackAt(step);
      states = tree.solidityProxy.extractStatesDefinitions();
      if (functionDefinition.parameters) {
        const inputs = functionDefinition.parameters;
        const outputs = functionDefinition.returnParameters;
        // for (const element of functionDefinition.parameters) {
        //   if (element.nodeType === 'ParameterList') {
        //     if (!inputs) inputs = element
        //     else {
        //       outputs = element
        //       break
        //     }
        //   }
        // }
        // input params
        if (inputs && inputs.parameters) {
          functionDefinitionAndInputs.inputs = addParams(inputs, tree, scopeId, states, contractObj, previousSourceLocation, stack.length, inputs.parameters.length, -1);
        }
        // output params
        if (outputs) addParams(outputs, tree, scopeId, states, contractObj, previousSourceLocation, stack.length, 0, 1);
      }
    } catch (error) {
      console.log(error);
    }

    tree.functionDefinitionsByScope[scopeId] = functionDefinitionAndInputs;
  }
}

// this extract all the variable declaration for a given ast and file
// and keep this in a cache
function resolveVariableDeclaration(tree: InternalCallTree, sourceLocation: SourceLocation, generatedSources: GeneratedSource) {
  if (!tree.variableDeclarationByFile[sourceLocation.file]) {
    const ast = tree.solidityProxy.ast(sourceLocation, generatedSources);
    if (ast) {
      tree.variableDeclarationByFile[sourceLocation.file] = extractVariableDeclarations(ast, tree.astWalker);
    } else {
      return null;
    }
  }
  return tree.variableDeclarationByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file];
}

// this extract all the function definition for a given ast and file
// and keep this in a cache
function resolveFunctionDefinition(tree: InternalCallTree, sourceLocation: SourceLocation, generatedSources: GeneratedSource) {
  if (!tree.functionDefinitionByFile[sourceLocation.file]) {
    const ast = tree.solidityProxy.ast(sourceLocation, generatedSources);
    if (ast) {
      tree.functionDefinitionByFile[sourceLocation.file] = extractFunctionDefinitions(ast, tree.astWalker);
    } else {
      return null;
    }
  }
  return tree.functionDefinitionByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file];
}

function extractVariableDeclarations(ast, astWalker) {
  const ret = {};
  astWalker.walkFull(ast, (node) => {
    if (node.nodeType === 'VariableDeclaration' || node.nodeType === 'YulVariableDeclaration') {
      ret[node.src] = [node];
    }
    const hasChild = node.initialValue && (node.nodeType === 'VariableDeclarationStatement' || node.nodeType === 'YulVariableDeclarationStatement');
    if (hasChild) ret[node.initialValue.src] = node.declarations;
  });
  return ret;
}

function extractFunctionDefinitions(ast, astWalker) {
  const ret = {};
  astWalker.walkFull(ast, (node) => {
    if (node.nodeType === 'FunctionDefinition' || node.nodeType === 'YulFunctionDefinition') {
      ret[node.src] = node;
    }
  });
  return ret;
}

function addParams(parameterList, tree, scopeId, states, contractObj, sourceLocation, stackLength, stackPosition, dir) {
  const contractName = contractObj.name;
  const params = [];
  for (const inputParam in parameterList.parameters) {
    const param = parameterList.parameters[inputParam];
    const stackDepth = stackLength + (dir * stackPosition);
    if (stackDepth >= 0) {
      let location = extractLocationFromAstVariable(param);
      location = location === 'default' ? 'memory' : location;
      const attributesName = param.name === '' ? `$${inputParam}` : param.name;
      console.log("try to parseType");
      tree.scopes[scopeId].locals[attributesName] = {
        name: attributesName,
        // type: parseType(param.typeDescriptions.typeString, states, contractName, location),
        stackDepth: stackDepth,
        sourceLocation: sourceLocation,
        abi: contractObj.contract.abi
      };
      params.push(attributesName);
    }
    stackPosition += dir;
  }
  return params;
}
