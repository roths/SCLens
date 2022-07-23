
import { util } from '@remix-project/remix-lib';
import Web3 from 'web3';
import { CompiledContractObj, GeneratedSource } from '../common/type';
import { isContractCreation } from '../trace/traceHelper';
import { TraceManager } from '../trace/traceManager';
import { nameOpCodes } from './codeUtils';

export interface BlockChainInstruction {
    // `bytecode_offset opcode_full_name data` e.g `000 PUSH1 80`、`004 MSTORE`
    instructions: string[],
    // key: bytecode_offset
    // value: `instructions` index
    instructionsIndexByBytesOffset: { [key: number]: number; },
    // bytecode from block chain like 0x....
    bytecode: string;
}

export interface SourceLocation {
    start: number,
    length: number,
    file: number,
    jump: string,
    modifierDepth: number;
}

export class CodeManager {
    private web3: Web3;
    private instructionsCache: { [contractAddress: string]: BlockChainInstruction; } = {};
    private sourceMapCache: { [contractAddress: string]: SourceLocation[]; } = {};
    private generatedSourcesCache: { [contractAddress: string]: GeneratedSource[]; } = {};
    private traceManager: TraceManager;

    constructor(web3: Web3, traceManager: TraceManager) {
        this.web3 = web3;
        this.traceManager = traceManager;
    }

    async getSourceLocationByVMTraceIndex(contractAddress: string, vmTraceIndex: number, contracts: CompiledContractObj) {
        const instructions = await this.getInstructions(contractAddress);
        const { sourceMap } = this.getSourceMap(contractAddress, instructions.bytecode, contracts) ?? {};
        const instructionIndex = await this.getInstructionIndex(contractAddress, vmTraceIndex);
        if (sourceMap) {
            return sourceMap[instructionIndex];
        } else {
            return null;
        }
    }

    async getSourceLocationByInstructionIndex(contractAddress: string, instructionIndex: number, contracts: CompiledContractObj): Promise<SourceLocation | null> {
        const instructions = await this.getInstructions(contractAddress);
        const { sourceMap } = this.getSourceMap(contractAddress, instructions.bytecode, contracts) ?? {};
        if (sourceMap) {
            return sourceMap[instructionIndex];
        } else {
            return null;
        }
    }

    async getValidSourceLocationByVMTraceIndex(contractAddress: string, vmTraceIndex: number, contracts: CompiledContractObj) {
        // not include generatedSources
        const amountOfSources = Object.keys(contracts).length;
        let location: SourceLocation = {
            start: -1,
            length: -1,
            file: -1,
            jump: "-",
            modifierDepth: 0
        };

        while (vmTraceIndex >= 0 && (location.file === -1 || location.file > amountOfSources - 1)) {
            const curLocation = await this.getSourceLocationByVMTraceIndex(contractAddress, vmTraceIndex, contracts);
            if (curLocation === null) {
                throw new Error("can not getSourceLocationByVMTraceIndex, vmTraceIndex:" + vmTraceIndex);
            }
            location = curLocation;
            vmTraceIndex = vmTraceIndex - 1;
        }
        return location;
    }

    private async getInstructions(contractAddress: string): Promise<BlockChainInstruction> {
        if (!this.instructionsCache[contractAddress]) {
            // bytecode like 0x....
            const codeFromChain = await this.web3.eth.getCode(contractAddress);
            // TODO: hardfork
            const [code, instructionsIndexByBytesOffset] = nameOpCodes(Buffer.from(codeFromChain.substring(2), 'hex'), 'london');
            this.instructionsCache[contractAddress] = {
                instructions: code,
                instructionsIndexByBytesOffset: instructionsIndexByBytesOffset,
                bytecode: codeFromChain
            };
        }
        return this.instructionsCache[contractAddress];
    }

    private async getInstructionIndex(contractAddress: string, vmTraceIndex: number) {
        try {
            const pc = this.traceManager.getTraceLog(vmTraceIndex).pc;
            const blockChainInstruction = await this.getInstructions(contractAddress);
            const itemIndex = blockChainInstruction.instructionsIndexByBytesOffset[pc];
            return itemIndex;
        } catch (error) {
            console.log(error);
            throw new Error('Cannot retrieve current PC for ' + vmTraceIndex);
        }
    }

    private getSourceMap(contractAddress: string, blockChainByteCode: string, contracts: CompiledContractObj) {
        if (this.generatedSourcesCache[contractAddress] || this.sourceMapCache[contractAddress]) {
            return { generatedSources: this.generatedSourcesCache[contractAddress], sourceMap: this.sourceMapCache[contractAddress] };
        }
        const isCreation = isContractCreation(contractAddress);
        for (const file in contracts) {
            for (const contract in contracts[file]) {
                const compiledBytecode = contracts[file][contract].evm.bytecode;
                const compiledDeployedBytecode = contracts[file][contract].evm.deployedBytecode;
                if (!compiledDeployedBytecode) {
                    continue;
                }

                const bytecodeStr = isCreation ? compiledBytecode.object : compiledDeployedBytecode.object;
                if (util.compareByteCode(blockChainByteCode, '0x' + bytecodeStr)) {
                    const generatedSources = isCreation ? compiledBytecode.generatedSources : compiledDeployedBytecode.generatedSources;
                    const sourceMap = isCreation ? compiledBytecode.sourceMap : compiledDeployedBytecode.sourceMap;
                    this.sourceMapCache[contractAddress] = this.decodeSourceMap(sourceMap);
                    this.generatedSourcesCache[contractAddress] = generatedSources;
                    return { generatedSources: this.generatedSourcesCache[contractAddress], sourceMap: this.sourceMapCache[contractAddress] };
                }
            }
        }
        return null;
    }

    private decodeSourceMap(sourceMap: string) {
        const ret: SourceLocation = {
            start: 0,
            length: 0,
            file: 0,
            jump: "",
            modifierDepth: 0
        };
        const sourceLocations: SourceLocation[] = [];
        const map = sourceMap.split(';');
        for (let k = 0; k < map.length; k++) {
            if (map[k].length === 0) {
                sourceLocations.push(Object.assign({}, ret));
                continue;
            }
            let current = map[k].split(':');
            if (current[0] && current[0].length) {
                ret.start = parseInt(current[0]);
            }
            if (current[1] && current[1].length) {
                ret.length = parseInt(current[1]);
            }
            if (current[2] && current[2].length) {
                ret.file = parseInt(current[2]);
            }
            if (current[3] && current[3].length) {
                ret.jump = current[3];
            }
            sourceLocations.push(Object.assign({}, ret));
        }
        return sourceLocations;
    }
}