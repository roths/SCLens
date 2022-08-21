'use strict';
import { AstWalker } from '@remix-project/remix-astwalker';
import { util } from '@remix-project/remix-lib';
import { TraceManager } from '../trace/traceManager';
import { AstNode, CompilationResult, StructLog, VariableDeclarationAstNode, YulBlockAstNode, YulVariableDeclarationAstNode } from '../../common/type';
// import { SourceLocationTracker } from '../source/sourceLocationTracker'
// import { EventManager } from '../eventManager'
import { parseType, SolidityType } from './decodeInfo';
import { ContractObject, SolidityProxy } from './solidityProxy';
import { isContractCreation, isCallInstruction, isCreateInstruction, isJumpDestInstruction } from '../trace/traceHelper';
import { extractLocationFromAstVariable } from '../../util';
import { CodeManager, SourceLocation } from '../code/codeManager';
import { GeneratedSource } from '../../common/type';
import { StatesDefinitions } from './astHelper';
import { AbiItem } from 'web3-utils';

/**
 * Tree representing internal jump into function.
 * Triggers `callTreeReady` event when tree is ready
 * Triggers `callTreeBuildFailed` event when tree fails to build
 */
export class InternalCallTree {
  private includeLocalVariables = true;
  // event
  solidityProxy: SolidityProxy;
  traceManager: TraceManager;
  codeManager: CodeManager;
  scopes: {
    [scopeId: string]: {
      firstStep: number,
      isCreation: boolean,
      lastStep: number,
      locals: {
        [varName: string]: {
          name: string,
          type: SolidityType,
          stackDepth: number,
          sourceLocation: SourceLocation,
          abi?: AbiItem[];
        };
      };
    };
  } = {};
  scopeStarts: {
    [key: number]: string;
  } = {};
  functionCallStack: number[] = [];
  functionDefinitionsByScope: any;
  variableDeclarationByFile: {
    [filePath: string]: {
      [src: string]: any[];
    };
  } = {};
  functionDefinitionByFile: {
    [fileId: number]: {
      [src: string]: any;
    };
  } = {};
  astWalker!: AstWalker;
  reducedTrace: number[] = [];

  constructor(traceManager: TraceManager, solidityProxy: SolidityProxy, codeManager: CodeManager) {
    // this.debugWithGeneratedSources = false
    this.solidityProxy = solidityProxy;
    this.traceManager = traceManager;
    this.codeManager = codeManager;
  }

  async newTraceLoaded() {
    this.reset();
    if (!this.solidityProxy.loaded()) {
      throw new Error('compilation result not loaded. Cannot build internal call tree');
    } else {
      // each recursive call to buildTree represent a new context (either call, delegatecall, internal function)
      const calledAddress = this.traceManager.getCurrentCalledAddressAt(0);
      const isCreation = isContractCreation(calledAddress!);

      const result: any = await this.buildTree(0, '', true, isCreation);
      if (result.error) {
        throw new Error(result.error);
      } else {
        this.createReducedTrace(this.traceManager.getLength() - 1);
      }
    }
  }

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
    if (scopeId !== '' && !scopeId) {
      return null;
    }
    let scope = this.scopes[scopeId];
    while (scope.lastStep && scope.lastStep < vmtraceIndex && scope.firstStep > 0) {
      scopeId = this.parentScope(scopeId);
      scope = this.scopes[scopeId];
    }
    return scope;
  }

  parentScope(scopeId: string) {
    if (scopeId.indexOf('.') === -1) {
      return '';
    }
    return scopeId.replace(/(\.\d+)$/, '');
  }

  findScopeId(vmtraceIndex: number) {
    const scopes = Object.keys(this.scopeStarts);
    if (!scopes.length) {
      return null;
    }
    const scopeStart = util.findLowerBoundValue(vmtraceIndex, scopes);
    return this.scopeStarts[scopeStart];
  }

  retrieveFunctionsStack(vmtraceIndex: number) {
    const scope = this.findScope(vmtraceIndex);
    if (!scope) {
      return [];
    }
    let scopeId = this.scopeStarts[scope.firstStep];
    const functions: any[] = [];
    if (!scopeId) {
      return functions;
    }
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i += 1;
      if (i > 1000) {
        throw new Error('retrieFunctionStack: recursion too deep');
      }
      const functionDefinition = this.functionDefinitionsByScope[scopeId];
      if (functionDefinition !== undefined) {
        functions.push(functionDefinition);
      }
      const parent = this.parentScope(scopeId);
      if (!parent) {
        break;
      }
      else {
        scopeId = parent;
      }
    }
    return functions;
  }

  async extractSourceLocation(vmTraceIndex: number): Promise<SourceLocation | null> {
    try {
      const address = this.traceManager.getCurrentCalledAddressAt(vmTraceIndex);
      // console.log("try to getSourceLocationFromVMTraceIndex")
      const location = await this.codeManager.getSourceLocationByVMTraceIndex(address!, vmTraceIndex, this.solidityProxy.contracts);
      return location;
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve sourcelocation for step ' + vmTraceIndex + ' ' + error);
    }
  }

  async extractValidSourceLocation(vmTraceIndex: number) {
    try {
      const address = this.traceManager.getCurrentCalledAddressAt(vmTraceIndex)!;
      console.log("try to getValidSourceLocationFromVMTraceIndex");
      const location = await this.codeManager.getValidSourceLocationByVMTraceIndex(address, vmTraceIndex, this.solidityProxy.contracts);
      return location;
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve valid sourcelocation for step ' + vmTraceIndex + ' ' + error);
    }
  }


  private async buildTree(vmTraceIndex: number, scopeId: string, isExternalCall: boolean, isCreation: boolean): Promise<any> {
    let subScope = 1;
    this.scopeStarts[vmTraceIndex] = scopeId;
    this.scopes[scopeId] = { firstStep: vmTraceIndex, locals: {}, isCreation , lastStep: vmTraceIndex};

    function callDepthChange(tree: InternalCallTree, step: number) {
      if (step + 1 < tree.traceManager.getLength()) {
        return tree.traceManager.getTraceLog(step).depth !== tree.traceManager.getTraceLog(step + 1).depth;
      }
      return false;
    }

    function includedSource(source: SourceLocation, included: SourceLocation) {
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
    while (vmTraceIndex < this.traceManager.getLength()) {
      let sourceLocation: SourceLocation | null = null;
      let newLocation = false;
      try {
        sourceLocation = await this.extractSourceLocation(vmTraceIndex);
        if (!includedSource(sourceLocation!, currentSourceLocation!)) {
          this.reducedTrace.push(vmTraceIndex);
          currentSourceLocation = sourceLocation;
          newLocation = true;
        }
      } catch (e) {
        return { outStep: vmTraceIndex, error: 'InternalCallTree - Error resolving source location. ' + vmTraceIndex + ' ' + e };
      }
      if (!sourceLocation) {
        return { outStep: vmTraceIndex, error: 'InternalCallTree - No source Location. ' + vmTraceIndex };
      }
      const isCallInstrn = isCallInstruction(this.traceManager.getTraceLog(vmTraceIndex));
      const isCreateInstrn = isCreateInstruction(this.traceManager.getTraceLog(vmTraceIndex));
      // we are checking if we are jumping in a new CALL or in an internal function
      if (isCallInstrn || sourceLocation.jump === 'i') {
        try {
          const externalCallResult = await this.buildTree(vmTraceIndex + 1, scopeId === '' ? subScope.toString() : scopeId + '.' + subScope, isCallInstrn, isCreateInstrn);
          if (externalCallResult.error) {
            return { outStep: vmTraceIndex, error: 'InternalCallTree - ' + externalCallResult.error };
          } else {
            vmTraceIndex = externalCallResult.outStep;
            subScope++;
          }
        } catch (e: any) {
          return { outStep: vmTraceIndex, error: 'InternalCallTree - ' + e.message };
        }
      } else if ((isExternalCall && callDepthChange(this, vmTraceIndex)) || (!isExternalCall && sourceLocation.jump === 'o')) {
        // if not, we might be returning from a CALL or internal function. This is what is checked here.
        this.scopes[scopeId].lastStep = vmTraceIndex;
        return { outStep: vmTraceIndex + 1 };
      } else {
        // if not, we are in the current scope.
        // We check in `includeVariableDeclaration` if there is a new local variable in scope for this specific `step`
        if (this.includeLocalVariables) {
          await this.includeVariableDeclaration(vmTraceIndex, sourceLocation, scopeId, newLocation, previousSourceLocation);
        }
        previousSourceLocation = sourceLocation;
        vmTraceIndex++;
      }
    }
    return { outStep: vmTraceIndex };
  }

  // the reduced trace contain an entry only if that correspond to a new source location
  private createReducedTrace(index: number) {
    this.reducedTrace.push(index);
  }

  private getGeneratedSources(scopeId: string, contractObj: ContractObject | null): GeneratedSource[] | null {
    // if (this.debugWithGeneratedSources && contractObj && this.scopes[scopeId]) {
    //   return this.scopes[scopeId].isCreation ? contractObj.contract.evm.bytecode.generatedSources : contractObj.contract.evm.deployedBytecode.generatedSources;
    // }
    return null;
  }

  private async includeVariableDeclaration(vmTraceIndex: number, sourceLocation: SourceLocation, scopeId: string, newLocation: boolean, previousSourceLocation: SourceLocation) {
    const contractObj = await this.solidityProxy.contractObjectAt(vmTraceIndex);
    let states = null;
    const generatedSources = this.getGeneratedSources(scopeId, contractObj);
    const variableDeclarations = this.resolveVariableDeclaration(sourceLocation, generatedSources);
    // using the vm trace step, the current source location and the ast,
    // we check if the current vm trace step target a new ast node of type VariableDeclaration
    // that way we know that there is a new local variable from here.
    if (variableDeclarations && variableDeclarations.length) {
      for (const variableDeclaration of variableDeclarations) {
        if (variableDeclaration && !this.scopes[scopeId].locals[variableDeclaration.name]) {
          try {
            const stack = this.traceManager.getStackAt(vmTraceIndex);
            // the stack length at this point is where the value of the new local variable will be stored.
            // so, either this is the direct value, or the offset in memory. That depends on the type.
            if (variableDeclaration.name !== '') {
              states = this.solidityProxy.extractStatesDefinitions();
              let location = extractLocationFromAstVariable(variableDeclaration);
              location = location === 'default' ? 'storage' : location;
              // we push the new local variable in our tree
              this.scopes[scopeId].locals[variableDeclaration.name] = {
                name: variableDeclaration.name,
                type: parseType(variableDeclaration.typeDescriptions.typeString, states, contractObj!.name, location),
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
    const functionDefinition = this.resolveFunctionDefinition(previousSourceLocation, generatedSources);
    if (!functionDefinition) {
      return;
    }

    const previousIsJumpDest2 = isJumpDestInstruction(this.traceManager.getTraceLog(vmTraceIndex - 2));
    const previousIsJumpDest1 = isJumpDestInstruction(this.traceManager.getTraceLog(vmTraceIndex - 1));
    const isConstructor = functionDefinition.kind === 'constructor';
    if (newLocation && (previousIsJumpDest1 || previousIsJumpDest2 || isConstructor)) {
      this.functionCallStack.push(vmTraceIndex);
      const functionDefinitionAndInputs: {
        functionDefinition: any,
        inputs: any[];
      } = { functionDefinition, inputs: [] };
      // means: the previous location was a function definition && JUMPDEST
      // => we are at the beginning of the function and input/output are setup

      try {
        const stack = this.traceManager.getStackAt(vmTraceIndex);
        states = this.solidityProxy.extractStatesDefinitions();
        if (functionDefinition.parameters) {
          const inputs = functionDefinition.parameters;
          const outputs = functionDefinition.returnParameters;
          // input params
          if (inputs && inputs.parameters) {
            functionDefinitionAndInputs.inputs = this.addParams(inputs, scopeId, states, contractObj!, previousSourceLocation, stack.length, inputs.parameters.length, -1);
          }
          // output params
          if (outputs) {
            this.addParams(outputs, scopeId, states, contractObj!, previousSourceLocation, stack.length, 0, 1);
          }
        }
      } catch (error) {
        console.log(error);
      }

      this.functionDefinitionsByScope[scopeId] = functionDefinitionAndInputs;
    }
  }

  // this extract all the variable declaration for a given ast and file
  // and keep this in a cache
  private resolveVariableDeclaration(sourceLocation: SourceLocation, generatedSources: GeneratedSource[] | null) {
    if (!this.variableDeclarationByFile[sourceLocation.file]) {
      const ast = this.solidityProxy.ast(sourceLocation, generatedSources);
      if (ast) {
        this.variableDeclarationByFile[sourceLocation.file] = this.extractVariableDeclarations(ast, this.astWalker);
      } else {
        return null;
      }
    }
    return this.variableDeclarationByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file];
  }

  // this extract all the function definition for a given ast and file
  // and keep this in a cache
  private resolveFunctionDefinition(sourceLocation: SourceLocation, generatedSources: GeneratedSource[] | null) {
    if (!this.functionDefinitionByFile[sourceLocation.file]) {
      const ast = this.solidityProxy.ast(sourceLocation, generatedSources);
      if (ast) {
        this.functionDefinitionByFile[sourceLocation.file] = this.extractFunctionDefinitions(ast, this.astWalker);
      } else {
        return null;
      }
    }
    return this.functionDefinitionByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file];
  }

  private extractVariableDeclarations(ast: AstNode | YulBlockAstNode, astWalker: AstWalker) {
    const ret: {
      [src: string]: any[];
    } = {};
    astWalker.walkFull(ast as any, (node: any) => {
      if (node.nodeType === 'VariableDeclaration' || node.nodeType === 'YulVariableDeclaration') {
        ret[node.src] = [node];
      }
      const hasChild = node.initialValue && (node.nodeType === 'VariableDeclarationStatement' || node.nodeType === 'YulVariableDeclarationStatement');
      if (hasChild) {
        ret[node.initialValue.src] = node.declarations;
      }
    });
    return ret;
  }

  private extractFunctionDefinitions(ast: any, astWalker: AstWalker) {
    const ret: {
      [src: string]: any;
    } = {};
    astWalker.walkFull(ast, (node: any) => {
      if (node.nodeType === 'FunctionDefinition' || node.nodeType === 'YulFunctionDefinition') {
        ret[node.src] = node;
      }
    });
    return ret;
  }

  private addParams(parameterList: any, scopeId: string, states: StatesDefinitions, contractObj: ContractObject, sourceLocation: SourceLocation, stackLength: number, stackPosition: number, dir: number) {
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
        this.scopes[scopeId].locals[attributesName] = {
          name: attributesName,
          type: parseType(param.typeDescriptions.typeString, states, contractName, location),
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

}