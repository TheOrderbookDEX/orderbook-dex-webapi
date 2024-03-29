import { ContractEvent, getBlockNumber } from '@frugalwizard/abi2ts-lib';
import { abortPromise, createAsyncQueue } from './utils';

const UPDATE_INTERVAL = 15000;

interface Callback {
    (event: ContractEvent): void;
}

export class ChainEvents {
    private static _instance?: ChainEvents;

    static async start() {
        if (!this._instance) {
            const latestBlockNumber = await getBlockNumber();
            this._instance = new ChainEvents(latestBlockNumber);
        }
    }

    static get instance() {
        if (!this._instance) {
            throw new Error('ChainEvents not started');
        }
        return this._instance;
    }

    static stop() {
        if (this._instance) {
            this._instance.abortController.abort();
            delete this._instance;
        }
    }

    private readonly listeners: Map<string, Set<Callback>>;
    private timeout: ReturnType<typeof setTimeout>;
    private readonly abortController: AbortController;

    private constructor(
        private _latestBlockNumber: number
    ) {
        this.listeners = new Map();
        this.timeout = setTimeout(() => this.update(), UPDATE_INTERVAL);
        this.abortController = new AbortController();
        this.abortController.signal.addEventListener('abort', () => clearTimeout(this.timeout), { once: true });
    }

    get latestBlockNumber() {
        return this._latestBlockNumber;
    }

    private async update() {
        const abortSignal = this.abortController.signal;
        try {
            const currentBlockNumber = await getBlockNumber(abortSignal);
            if (this._latestBlockNumber < currentBlockNumber) {
                const fromBlock = this._latestBlockNumber + 1;
                const toBlock = currentBlockNumber;
                this._latestBlockNumber = currentBlockNumber;
                // TODO we should be able to fetch events for multiple addresses in one operation
                for (const [address, callbacks] of this.listeners.entries()) {
                    for await (const event of ContractEvent.get({ address, fromBlock, toBlock }, abortSignal)) {
                        for (const callback of callbacks) {
                            try {
                                callback(event);
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    }
                }
            }
        } finally {
            if (!abortSignal.aborted) {
                this.timeout = setTimeout(() => this.update(), UPDATE_INTERVAL);
            }
        }
    }

    async forceUpdate() {
        clearTimeout(this.timeout);
        await this.update();
    }

    on(address: string, callback: Callback) {
        let addressListeners = this.listeners.get(address);
        if (!addressListeners) {
            addressListeners = new Set();
            this.listeners.set(address, addressListeners);
        }
        addressListeners.add(callback);
    }

    off(address: string, callback: Callback) {
        const addressListeners = this.listeners.get(address);
        if (addressListeners) {
            addressListeners.delete(callback);
            if (addressListeners.size == 0) {
                this.listeners.delete(address);
            }
        }
    }

    feed(address: string, abortSignal: AbortSignal): AsyncIterable<ContractEvent> {
        return createAsyncQueue<ContractEvent>(async (queue) => {
            const listener = (event: ContractEvent) => queue(event);
            ChainEvents.instance.on(address, listener);
            try {
                await abortPromise(abortSignal);
            } finally {
                ChainEvents.instance.off(address, listener);
            }
        });
    }
}
