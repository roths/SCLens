
/**
 * use for web3.debug.storageRangeAt
 */
export interface Storage {
    key: string,
    value: string
}
export interface StorageMap {
    [key: string]: Storage
}
export interface StorageRangeResult {
    nextKey: string,
    storage: StorageMap
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
    gas: number,
    gasCost: number,
    memory: string[],
    op: string,
    pc: number,
    stack: string[],
    storage: {
        [key: string]: string;
    }
}

export interface TraceTransaction {
    gas: number,
    returnValue: string,
    structLogs: StructLog[]
}