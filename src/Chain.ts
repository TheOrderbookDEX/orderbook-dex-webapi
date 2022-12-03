import { Ethereum, getEthereum } from './ethereum';
import { Database } from './Database';
import { ChainEvents } from './ChainEvents';
import { getBlockTimestamp } from '@frugal-wizard/abi2ts-lib';

/**
 * Connection to the blockchain.
 *
 * Once connected, page will reload if a change of chain or address is detected.
 */
export abstract class Chain {
    /**
     * Connect to the blockchain.
     *
     * @returns The connection to the blockchain.
     * @throws {ChainConnectionFailed} When connection fails.
     */
    static async connect(): Promise<Chain> {
        return await ChainInternal.connect();
    }

    /**
     * The connection to the blockchain.
     *
     * @throws {ChainNotConnected} When chain has not been connected.
     */
    static get instance(): Chain {
        return ChainInternal.instance;
    }

    /**
     * Disconnect from the blockchain.
     */
    static disconnect(): void {
        ChainInternal.disconnect();
    }

    /**
     * The id of the chain.
     */
    abstract get chainId(): number;

    /**
     * The name of the chain.
     */
    abstract get chainName(): string;

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected constructor() {}
}

export class ChainInternal extends Chain {
    private static _instance: ChainInternal | undefined;

    static async connect() {
        if (!this._instance) {
            const ethereum = getEthereum();
            if (!ethereum) {
                throw new ChainConnectionFailed();
            }
            const chainId = Number(await ethereum.request({ method: 'eth_chainId' }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._instance = new ChainInternal(chainId, ethereum);
            ethereum.on('chainChanged', () => {
                location.reload();
            });
            await Database.load(chainId);
            await ChainEvents.start();
        }
        return this._instance;
    }

    static get instance() {
        if (!this._instance) {
            throw new ChainNotConnected();
        }
        return this._instance;
    }

    static disconnect() {
        ChainEvents.stop();
        Database.unload();
        this._instance = undefined;
    }

    public MAX_GET_LOGS_BLOCKS: number;

    constructor(
        private readonly _chainId: number,
        public readonly _ethereum: Ethereum,
    ) {
        super();
        this.MAX_GET_LOGS_BLOCKS = 2000;
    }

    get chainId() {
        return this._chainId;
    }

    get chainName() {
        return chainNames[this._chainId] ?? 'Unknown Chain';
    }
}

export async function fetchBlockTimestamp(blockNumber: number, abortSignal?: AbortSignal) {
    try {
        return await Database.instance.getBlockTimestamp(blockNumber, abortSignal);
    } catch {
        const timestamp = await getBlockTimestamp(blockNumber, abortSignal);
        return await Database.instance.saveBlockTimestamp(blockNumber, timestamp, abortSignal);
    }
}

/**
 * Error thrown when connection to blockchain failed.
 */
export class ChainConnectionFailed extends Error {
    constructor() {
        super('Chain Connection Failed');
        this.name = 'ChainConnectionFailed';
    }
}

/**
 * Error thrown when trying to access the chain singleton instance before it is
 * connected.
 */
export class ChainNotConnected extends Error {
    constructor() {
        super('Chain Not Connected');
        this.name = 'ChainNotConnected';
    }
}

const chainNames: { [chainId: number]: string | undefined } = {};
chainNames[1]    = 'Ethereum Mainnet';
chainNames[3]    = 'Ropsten Testnet';
chainNames[4]    = 'Rinkeby Testnet';
chainNames[5]    = 'Goerli Testnet';
chainNames[42]   = 'Kovan Testnet';
chainNames[56]   = 'BSC Mainnet';
chainNames[97]   = 'BSC Testnet';
chainNames[1337] = 'Development Testnet';
