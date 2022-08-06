import { AbiItem } from "web3-utils";
/// //////////////////////////////////////////////////////////
/// ////////// Web3 api structure ////////////////////////////
/// //////////////////////////////////////////////////////////

/**
 * use for web3.debug.storageRangeAt
 */
export interface Storage {
    key: string,
    value: string;
}
export interface StorageMap {
    [key: string]: Storage;
}
export interface StorageRangeResult {
    nextKey: string,
    storage: StorageMap;
}


/**
 * use for web3.debug.traceTransaction
 */
export class TraceTransactionOptions {
    disableStorage: boolean = false;
    disableStack = false;
    enableMemory = false;
    disableMemory = false;
    enableReturnData = false;
    fullStorage = false;
    tracer?: string;
    // timeout:string;
}

export interface StructLog {
    depth: number,
    error?: string,
    invalidDepthChange: boolean,
    // remaining gas
    gas: number,
    // step cost
    gasCost: number,
    memory: string[],
    memexpand?: string;
    op: string,
    pc: number,
    stack: string[],
    storage: {
        [key: string]: string;
    };
}

export interface TraceTransaction {
    gas: number,
    returnValue: string,
    structLogs: StructLog[];
}

/// //////////////////////////////////////////////////////////
/// ////////// TODO /////////////////////////////
/// //////////////////////////////////////////////////////////

export interface Source {
    [fileName: string]:
    {
        // Optional: keccak256 hash of the source file
        keccak256?: string,
        // Required (unless "urls" is used): literal contents of the source file
        content: string,
        urls?: string[];
    };
}

export interface ComplitionSources {
    [contractName: string]: CompilationSource;
}

export interface CompiledContractObj {
    /** If the language used has no contract names, this field should equal to an empty string. */
    [fileName: string]: {
        [contract: string]: CompiledContract;
    };
}

export interface CompilationResult {
    /** not present if no errors/warnings were encountered */
    errors?: CompilationError[];
    /** This contains the file-level outputs. In can be limited/filtered by the outputSelection settings */
    sources?: ComplitionSources;
    /** This contains the contract-level outputs. It can be limited/filtered by the outputSelection settings */
    contracts?: CompiledContractObj;
}



export interface ContractHLAst {
    node: ContractDefinitionAstNode,
    functions: FunctionHLAst[],
    relevantNodes: {
        referencedDeclaration: number,
        node: any;
    }[],
    modifiers: ModifierHLAst[],
    inheritsFrom: string[],
    stateVariables: VariableDeclarationAstNode[];
}

export interface FunctionHLAst {
    node: FunctionDefinitionAstNode,
    relevantNodes: any[],
    modifierInvocations: ModifierInvocationAstNode[],
    localVariables: VariableDeclarationAstNode[],
    parameters: string[],
    returns: Record<string, string>[];
}

export interface ModifierHLAst {
    node: ModifierDefinitionAstNode,
    relevantNodes: any[],
    localVariables: VariableDeclarationAstNode[],
    parameters: string[],
}

export interface Context {
    callGraph: Record<string, ContractCallGraph>;
    currentContract: ContractHLAst;
    stateVariables: VariableDeclarationAstNode[];
}

export interface FunctionCallGraph {
    node: FunctionHLAst;
    calls: string[];
}

export interface ContractCallGraph {
    contract: ContractHLAst;
    functions: Record<string, FunctionCallGraph>;
}

/// //////////////////////////////////////////////////////////
/// ////////// Specfic AST Nodes /////////////////////////////
/// //////////////////////////////////////////////////////////

interface TypeDescription {
    typeIdentifier: string;
    typeString: string;
}

export interface SourceUnitAstNode {
    id: number;
    nodeType: 'SourceUnit';
    src: string;
    absolutePath: string;
    exportedSymbols: Record<string, unknown>;
    nodes: Array<AstNode>;
}

export interface PragmaDirectiveAstNode {
    id: number;
    nodeType: 'PragmaDirective';
    src: string;
    literals?: Array<string>;
}

interface SymbolAlias {
    foreign: IdentifierAstNode;
    local: string | null;
}

export interface ImportDirectiveAstNode {
    id: number;
    nodeType: 'ImportDirective';
    src: string;
    absolutePath: string;
    file: string;
    scope: number;
    sourceUnit: number;
    symbolAliases: Array<SymbolAlias>;
    unitAlias: string;
}

export interface ContractDefinitionAstNode {
    id: number;
    nodeType: 'ContractDefinition';
    src: string;
    name: string;
    documentation: string | null;
    contractKind: 'interface' | 'contract' | 'library';
    abstract: boolean;
    fullyImplemented: boolean;
    linearizedBaseContracts: Array<number>;
    baseContracts: Array<InheritanceSpecifierAstNode>;
    contractDependencies: Array<number>;
    nodes: Array<any>;
    scope: number;
}

export interface InheritanceSpecifierAstNode {
    id: number;
    nodeType: 'InheritanceSpecifier';
    src: string;
    baseName: UserDefinedTypeNameAstNode;
    arguments: LiteralAstNode | null;
}

export interface UsingForDirectiveAstNode {
    id: number;
    nodeType: 'UsingForDirective';
    src: string;
    libraryName: UserDefinedTypeNameAstNode;
    typeName: UserDefinedTypeNameAstNode | ElementaryTypeNameAstNode | null;
}

export interface StructDefinitionAstNode {
    id: number;
    nodeType: 'StructDefinition';
    src: string;
    name: string;
    visibility: string;
    canonicalName: string;
    members: Array<VariableDeclarationAstNode>;
    scope: number;
}

export interface EnumDefinitionAstNode {
    id: number;
    nodeType: 'EnumDefinition';
    src: string;
    name: string;
    canonicalName: string;
    members: Array<EnumValueAstNode>;
}

export interface EnumValueAstNode {
    id: number;
    nodeType: 'EnumValue';
    src: string;
    name: string;
}

export interface ParameterListAstNode {
    id: number;
    nodeType: 'ParameterList';
    src: string;
    parameters: Array<VariableDeclarationAstNode>;
}

export interface OverrideSpecifierAstNode {
    id: number;
    nodeType: 'OverrideSpecifier';
    src: string;
    overrides: Array<UserDefinedTypeNameAstNode>;
}

export interface FunctionDefinitionAstNode {
    id: number;
    nodeType: 'FunctionDefinition';
    src: string;
    name: string;
    documentation: string | null;
    kind: string;
    stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
    visibility: string;
    virtual: boolean;
    overrides: OverrideSpecifierAstNode | null;
    parameters: ParameterListAstNode;
    returnParameters: ParameterListAstNode;
    modifiers: Array<ModifierInvocationAstNode>;
    body: Record<string, unknown> | null;
    implemented: boolean;
    scope: number;
    functionSelector?: string;
    baseFunctions?: Array<number>;
}

export interface VariableDeclarationAstNode {
    id: number;
    nodeType: 'VariableDeclaration';
    src: string;
    name: string;
    typeName: ElementaryTypeNameAstNode | UserDefinedTypeNameAstNode;
    constant: boolean;
    stateVariable: boolean;
    storageLocation: 'storage' | 'memory' | 'calldata' | 'default';
    overrides: OverrideSpecifierAstNode | null;
    visibility: string;
    value: string | null;
    scope: number;
    typeDescriptions: TypeDescription;
    functionSelector?: string;
    indexed?: boolean;
    baseFunctions?: Record<string, unknown>;
    mutability: string;
}

export interface ModifierDefinitionAstNode {
    id: number;
    nodeType: 'ModifierDefinition';
    src: string;
    name: string;
    documentation: Record<string, unknown> | null;
    visibility: string;
    parameters: ParameterListAstNode;
    virtual: boolean;
    overrides: OverrideSpecifierAstNode | null;
    body: BlockAstNode;
    baseModifiers?: Array<number>;
}

export interface ModifierInvocationAstNode {
    id: number;
    nodeType: 'ModifierInvocation';
    src: string;
    modifierName: IdentifierAstNode;
    arguments: Array<LiteralAstNode> | null;
}

export interface EventDefinitionAstNode {
    id: number;
    nodeType: 'EventDefinition';
    src: string;
    name: string;
    documentation: Record<string, unknown> | null;
    parameters: ParameterListAstNode;
    anonymous: boolean;
}

export interface ElementaryTypeNameAstNode {
    id: number;
    nodeType: 'ElementaryTypeName';
    src: string;
    name: string;
    typeDescriptions: TypeDescription;
    stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export interface UserDefinedTypeNameAstNode {
    id: number;
    nodeType: 'UserDefinedTypeName';
    src: string;
    name: string;
    referencedDeclaration: number;
    contractScope: number | null;
    typeDescriptions: TypeDescription;
}

export interface FunctionTypeNameAstNode {
    id: number;
    nodeType: 'FunctionTypeName';
    src: string;
    name: string;
    visibility: string;
    stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
    parameterTypes: ParameterListAstNode;
    returnParameterTypes: ParameterListAstNode;
    typeDescriptions: TypeDescription;
}

export interface MappingAstNode {
    id: number;
    nodeType: 'Mapping';
    src: string;
    keyType: UserDefinedTypeNameAstNode | ElementaryTypeNameAstNode;
    valueType: UserDefinedTypeNameAstNode | ElementaryTypeNameAstNode;
    typeDescriptions: TypeDescription;
}

export interface ArrayTypeNameAstNode {
    id: number;
    nodeType: 'ArrayTypeName';
    src: string;
    baseType: UserDefinedTypeNameAstNode | ElementaryTypeNameAstNode;
    length: LiteralAstNode | null;
    typeDescriptions: TypeDescription;
}

interface externalReference {
    declaration: number;
    isOffset: boolean;
    isSlot: boolean;
    src: string;
    valueSize: number;
}

export interface InlineAssemblyAstNode {
    id: number;
    nodeType: 'InlineAssembly';
    src: string;
    AST: YulBlockAstNode;
    externalReferences: Array<externalReference>;
    evmVersion: string;
}

export interface BlockAstNode {
    id: number;
    nodeType: 'Block';
    src: string;
    statements: Array<any>;
}

export interface PlaceholderStatementAstNode {
    id: number;
    nodeType: 'PlaceholderStatement';
    src: string;
}

export interface IfStatementAstNode {
    id: number;
    nodeType: 'IfStatement';
    src: string;
    condition: Record<string, unknown>;
    trueBody: BlockAstNode | ExpressionStatementAstNode;
    falseBody: BlockAstNode | ExpressionStatementAstNode;
}

export interface TryCatchClauseAstNode {
    id: number;
    nodeType: 'TryCatchClause';
    src: string;
    errorName: string;
    parameters: ParameterListAstNode;
    block: BlockAstNode;
}

export interface TryStatementAstNode {
    id: number;
    nodeType: 'TryStatement';
    src: string;
    externalCall: Record<string, unknown>;
    clauses: Array<TryCatchClauseAstNode>;
}

export interface WhileStatementAstNode {
    id: number;
    nodeType: 'WhileStatement' | 'DoWhileStatement';
    src: string;
    condition: any;
    body: BlockAstNode | ExpressionStatementAstNode;
}

export interface ForStatementAstNode {
    id: number;
    nodeType: 'ForStatement';
    src: string;
    initializationExpression: VariableDeclarationStatementAstNode;
    condition: any;
    loopExpression: ExpressionStatementAstNode;
    body: BlockAstNode | ExpressionStatementAstNode;
}

export interface ContinueAstNode {
    id: number;
    nodeType: 'Continue';
    src: string;
}

export interface BreakAstNode {
    id: number;
    nodeType: 'Break';
    src: string;
}

export interface ReturnAstNode {
    id: number;
    nodeType: 'Return';
    src: string;
    expression: Record<string, unknown> | null;
    functionReturnParameters: number;
}

export interface ThrowAstNode {
    id: number;
    nodeType: 'Throw';
    src: string;
}

export interface EmitStatementAstNode {
    id: number;
    nodeType: 'EmitStatement';
    src: string;
    eventCall: FunctionCallAstNode;
}

export interface VariableDeclarationStatementAstNode {
    id: number;
    nodeType: 'VariableDeclarationStatement';
    src: string;
    assignments: Array<number>;
    declarations: Array<Record<string, unknown>>;
    initialValue: Record<string, unknown>;
}

export interface ExpressionStatementAstNode {
    id: number;
    nodeType: 'ExpressionStatement';
    src: string;
    expression: any;
}

interface ExpressionAttributes {
    typeDescriptions: TypeDescription;
    isConstant: boolean;
    isPure: boolean;
    isLValue: boolean;
    lValueRequested: boolean;
    argumentTypes: Array<TypeDescription> | null;
}

export interface ConditionalAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'Conditional';
    src: string;
    condition: Record<string, unknown>;
    trueExpression: Record<string, unknown>;
    falseExpression: Record<string, unknown>;
}

export interface AssignmentAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'Assignment';
    src: string;
    operator: string;
    leftHandSide: any;
    rightHandSide: Record<string, unknown>;
}

export interface TupleExpressionAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'TupleExpression';
    src: string;
    isInlineArray: boolean;
    components: Array<Record<string, unknown>>;
}

export interface UnaryOperationAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'UnaryOperation';
    src: string;
    prefix: boolean;
    operator: string;
    subExpression: any;
}

export interface BinaryOperationAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'BinaryOperation';
    src: string;
    operator: string;
    leftExpression: Record<string, unknown>;
    rightExpression: Record<string, unknown>;
    commonType: TypeDescription;
}

export interface FunctionCallAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'FunctionCall';
    src: string;
    expression: any;
    names: Array<any>;
    arguments: Record<string, unknown>;
    tryCall: boolean;
    kind: 'functionCall' | 'typeConversion' | 'structConstructorCall';
}

export interface FunctionCallOptionsAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'FunctionCallOptions';
    src: string;
    expression: Record<string, unknown>;
    names: Array<string>;
    options: Array<Record<string, unknown>>;
}

export interface NewExpressionAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'NewExpression';
    src: string;
    typeName: UserDefinedTypeNameAstNode | ElementaryTypeNameAstNode;
}

export interface MemberAccessAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'MemberAccess';
    src: string;
    memberName: string;
    expression: any;
    referencedDeclaration: number | null;
}

export interface IndexAccessAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'IndexAccess';
    src: string;
    baseExpression: Record<string, unknown>;
    indexExpression: Record<string, unknown>;
}

export interface IndexRangeAccessAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'IndexRangeAccess';
    src: string;
    baseExpression: Record<string, unknown>;
    startExpression: Record<string, unknown>;
    endExpression: Record<string, unknown>;
}

export interface ElementaryTypeNameExpressionAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'ElementaryTypeNameExpression';
    src: string;
    typeName: ElementaryTypeNameAstNode;
}

export interface LiteralAstNode extends ExpressionAttributes {
    id: number;
    nodeType: 'Literal';
    src: string;
    kind: 'number' | 'string' | 'bool';
    value: string;
    hexValue: string;
    subdenomination: 'wei' | 'szabo' | 'finney' | 'ether' | null;
}

export interface IdentifierAstNode {
    id: number;
    nodeType: 'Identifier';
    src: string;
    name: string;
    referencedDeclaration: number;
    overloadedDeclarations: Array<any>;
    typeDescriptions: TypeDescription;
    argumentTypes: Array<TypeDescription> | null;
}

export interface StructuredDocumentationAstNode {
    id: number;
    nodeType: 'StructuredDocumentation';
    src: string;
    text: string;
}

export interface CommonAstNode {
    id: number;
    nodeType: string;
    src: string;
    [x: string]: any;
}

/// //////////////////////////////////////////////////////
/// ////////// YUL AST Nodes /////////////////////////////
/// //////////////////////////////////////////////////////

export interface YulTypedNameAstNode {
    name: string;
    nodeType: 'YulTypedName';
    src: string;
    type: string;
}

export interface YulIdentifierAstNode {
    name: string;
    nodeType: 'YulIdentifier';
    src: string;
}

export interface YulLiteralAstNode {
    kind: string;
    nodeType: 'YulLiteral';
    src: string;
    type: string;
    value: string;
}

export interface YulVariableDeclarationAstNode {
    nodeType: 'YulVariableDeclaration';
    src: string;
    value: YulIdentifierAstNode | YulLiteralAstNode;
    variables: Array<YulTypedNameAstNode>;
}

export interface YulBlockAstNode {
    nodeType: 'YulBlock';
    src: string;
    statements: Array<YulVariableDeclarationAstNode>;
}

export interface CommonYulAstNode {
    nodeType: string;
    src: string;
    [x: string]: any;
}

/// ////////
// ERROR //
/// ////////

export interface CompilationError {
    /** Location within the source file */
    sourceLocation?: {
        file: string;
        start: number;
        end: number;
    };
    /** Error type */
    type?: CompilationErrorType;
    /** Component where the error originated, such as "general", "ewasm", etc. */
    component?: 'general' | 'ewasm' | string;
    severity?: 'error' | 'warning';
    message?: string;
    mode?: 'panic';
    /** the message formatted with source location */
    formattedMessage?: string;
}

type CompilationErrorType =
    | 'JSONError'
    | 'IOError'
    | 'ParserError'
    | 'DocstringParsingError'
    | 'SyntaxError'
    | 'DeclarationError'
    | 'TypeError'
    | 'UnimplementedFeatureError'
    | 'InternalCompilerError'
    | 'Exception'
    | 'CompilerError'
    | 'FatalError'
    | 'Warning';

/// /////////
// SOURCE //
/// /////////
export interface CompilationSource {
    /** Identifier of the source (used in source maps) */
    id: number;
    /** The AST object */
    ast: AstNode;
}

/// //////
// AST //
/// //////
export interface AstNode {
    absolutePath?: string;
    exportedSymbols?: Record<string, unknown>;
    id: number;
    nodeType: string;
    nodes?: Array<AstNode>;
    // format = s:l:f
    // 's': the byte-offset to the start of the range in the source file
    // 'l': the length of the source range in bytes
    // 'f': the source index mentioned above [CompilationSource.id]
    src: string;
    literals?: Array<string>;
    file?: string;
    scope?: number;
    sourceUnit?: number;
    symbolAliases?: Array<string>;
    [x: string]: any;
}

export interface AstNodeAtt {
    operator?: string;
    string?: null;
    type?: string;
    value?: string;
    constant?: boolean;
    name?: string;
    public?: boolean;
    exportedSymbols?: Record<string, unknown>;
    argumentTypes?: null;
    absolutePath?: string;
    [x: string]: any;
}

/// ///////////
// CONTRACT //
/// ///////////
export interface CompiledContract {
    /** The Ethereum Contract ABI. If empty, it is represented as an empty array. */
    abi: AbiItem[];
    // See the Metadata Output documentation (serialised JSON string)
    metadata: string;
    /** User documentation (natural specification) */
    userdoc: UserDocumentation;
    /** Developer documentation (natural specification) */
    devdoc: DeveloperDocumentation;
    /** Intermediate representation (string) */
    ir: string;
    /** EVM-related outputs */
    evm: {
        assembly: string;
        legacyAssembly: Record<string, unknown>;
        /** Bytecode and related details. */
        bytecode: BytecodeObject;
        deployedBytecode: BytecodeObject;
        /** The list of function hashes */
        methodIdentifiers: {
            [functionIdentifier: string]: string;
        };
        // Function gas estimates
        gasEstimates: {
            creation: {
                codeDepositCost: string;
                executionCost: 'infinite' | string;
                totalCost: 'infinite' | string;
            };
            external: {
                [functionIdentifier: string]: string;
            };
            internal: {
                [functionIdentifier: string]: 'infinite' | string;
            };
        };
    };
    /** eWASM related outputs */
    ewasm: {
        /** S-expressions format */
        wast: string;
        /** Binary format (hex string) */
        wasm: string;
    };
}
/// ////////////////////////
// NATURAL SPECIFICATION //
/// ////////////////////////

// Userdoc
export interface UserDocumentation {
    methods: UserMethodList;
    notice: string;
}

export type UserMethodList = {
    [functionIdentifier: string]: UserMethodDoc;
} & {
    'constructor'?: string;
};
export interface UserMethodDoc {
    notice: string;
}

// Devdoc
export interface DeveloperDocumentation {
    author: string;
    title: string;
    details: string;
    methods: DevMethodList;
}

export interface DevMethodList {
    [functionIdentifier: string]: DevMethodDoc;
}

export interface DevMethodDoc {
    author: string;
    details: string;
    return: string;
    params: {
        [param: string]: string;
    };
}

/// ///////////
// BYTECODE //
/// ///////////
export interface GeneratedSource {
    ast: YulBlockAstNode;
    id: number;
    language: string;
    name: string;
    contents: string;
}
export interface BytecodeObject {
    /** The bytecode as a hex string. */
    object: string;
    /** Opcodes list */
    opcodes: string;
    /** The source mapping as a string. See the source mapping definition. */
    // s:l:f:j:m
    // 's': the byte-offset to the start of the range in the source file
    // 'l': the length of the source range in bytes
    // 'f': the source index mentioned above [CompilationSource.id]
    // 'j': can be `i`, `o`, `-`. `i` means goes into a function. `o` means returns from a function. `-` means a regular jump as part of e.g. a loop
    // 'm': 
    sourceMap: string;
    generatedSources: GeneratedSource[];
    /** If given, this is an unlinked object. */
    linkReferences?: {
        [contractName: string]: {
            /** Byte offsets into the bytecode. */
            [library: string]: { start: number; length: number; }[];
        };
    };
}
