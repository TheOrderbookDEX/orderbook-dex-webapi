import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb';
import { Address } from './Address';
import { OrderExecutionType, OrderStatus, OrderType } from './Order';
import { checkAbortSignal } from './utils';

// TODO rename Cache to Database and related types accordingly
// TODO move UserData persisted data here

export class Cache {
    private static _instance?: Cache;

    static async load(chainId: number, version?: number) {
        if (!this._instance) {
            if (!version || version > 3) version = 3;
            if (version < 3) throw new Error('version removed');
            const db = await openDB<CacheV3>(`Cache${chainId}`, version, {
                async upgrade(db, oldVersion, newVersion: number) {
                    if (oldVersion < 3) {
                        const olddb = db as IDBPDatabase;
                        for (const name of olddb.objectStoreNames) {
                            olddb.deleteObjectStore(name);
                        }
                    }
                    if (newVersion >= 3) {
                        db.createObjectStore('blocks', {
                            keyPath: 'blockNumber',
                        });
                        db.createObjectStore('tokens', {
                            keyPath: 'address',
                        });
                        const orderbooks = db.createObjectStore('orderbooks', {
                            keyPath: 'address',
                        });
                        orderbooks.createIndex('byFactoryIndex', ['factory', 'factoryIndex'], { unique: true });
                        db.createObjectStore('priceHistoryRanges', {
                            keyPath: ['orderbook', 'toBlock'],
                        });
                        db.createObjectStore('priceHistoryTicks', {
                            keyPath: ['orderbook', 'blockNumber', 'logIndex'],
                        });
                        const orders = db.createObjectStore('orders', {
                            keyPath: 'key',
                        });
                        orders.createIndex('byOwner', ['owner', 'timestamp'], { unique: false });
                        orders.createIndex('byMainStatus', ['owner', 'mainStatus', 'timestamp'], { unique: false });
                    }
                }
            });
            this._instance = new Cache(db);
        }
    }

    static get instance() {
        if (!this._instance) {
            throw new Error('Cache not loaded');
        }
        return this._instance;
    }

    static unload() {
        if (this._instance) {
            this._instance._db.close();
            delete this._instance;
        }
    }

    constructor(private readonly _db: IDBPDatabase<CacheV3>) {}

    async getBlockTimestamp(blockNumber: number, abortSignal?: AbortSignal) {
        checkAbortSignal(abortSignal);
        const block = await this._db.get('blocks', blockNumber);
        checkAbortSignal(abortSignal);
        if (!block) throw new CacheMiss;
        return block.timestamp;
    }

    async saveBlockTimestamp(blockNumber: number, timestamp: number, abortSignal?: AbortSignal) {
        await this._db.put('blocks', { blockNumber, timestamp });
        checkAbortSignal(abortSignal);
        return timestamp;
    }

    async getToken(address: Address, abortSignal?: AbortSignal) {
        checkAbortSignal(abortSignal);
        const token = await this._db.get('tokens', address);
        checkAbortSignal(abortSignal);
        if (!token) throw new CacheMiss;
        return token;
    }

    async saveToken(token: CachedToken, abortSignal?: AbortSignal) {
        const { address, name, symbol, decimals } = token;
        await this._db.put('tokens', { address, name, symbol, decimals });
        checkAbortSignal(abortSignal);
    }

    static readonly GET_ORDERBOOKS_BATCH = 10;

    async * getOrderbooks(factory: Address, abortSignal?: AbortSignal) {
        const lastIndex = await this.getLastFactoryIndex(factory, abortSignal);
        if (!lastIndex) return;
        // due to how indexeddb works, we first fetch a batch then yield it
        for (let index = 0; index <= lastIndex; index += Cache.GET_ORDERBOOKS_BATCH) {
            const query = IDBKeyRange.bound([factory, index], [factory, index + Cache.GET_ORDERBOOKS_BATCH - 1]);
            const orderbooks = await this._db.getAllFromIndex('orderbooks', 'byFactoryIndex', query);
            checkAbortSignal(abortSignal);
            for (const orderbook of orderbooks) {
                yield orderbook;
            }
        }
    }

    async getLastFactoryIndex(factory: Address, abortSignal?: AbortSignal) {
        const query = IDBKeyRange.bound([factory, Number.NEGATIVE_INFINITY], [factory, Number.POSITIVE_INFINITY]);
        const cursor = await this._db.transaction('orderbooks').store.index('byFactoryIndex').openCursor(query, 'prev');
        checkAbortSignal(abortSignal);
        return cursor?.value.factoryIndex;
    }

    async getOrderbook(address: Address, abortSignal?: AbortSignal) {
        checkAbortSignal(abortSignal);
        const orderbook = await this._db.get('orderbooks', address);
        checkAbortSignal(abortSignal);
        if (!orderbook) throw new CacheMiss;
        return orderbook;
    }

    async saveOrderbook(orderbook: CachedOrderbook, abortSignal?: AbortSignal) {
        const {
            address,
            version,
            tradedToken,
            baseToken,
            contractSize,
            priceTick,
            creationBlockNumber,
            factory,
            factoryIndex,
        } = orderbook;
        await this._db.put('orderbooks', {
            address,
            version,
            tradedToken,
            baseToken,
            contractSize,
            priceTick,
            creationBlockNumber,
            factory,
            factoryIndex,
        });
        checkAbortSignal(abortSignal);
    }

    private async _getPriceHistoryRanges(
        tx: IDBPTransaction<CacheV3, ['priceHistoryRanges'], 'readonly' | 'readwrite'>,
        orderbook: Address, fromBlock: number, toBlock: number
    ) {
        const keyRange = IDBKeyRange.bound([orderbook, fromBlock], [orderbook, toBlock]);
        const ranges = await tx.store.getAll(keyRange);
        const next = await tx.store.get(IDBKeyRange.lowerBound([ orderbook, toBlock ], true));
        if (next && next.fromBlock <= toBlock) {
            ranges.push(next);
        }
        return ranges;
    }

    async getPriceHistoryRanges(orderbook: Address, fromBlock: number, toBlock: number, abortSignal?: AbortSignal) {
        checkAbortSignal(abortSignal);
        const tx = this._db.transaction('priceHistoryRanges', 'readonly');
        const ranges = await this._getPriceHistoryRanges(tx, orderbook, fromBlock, toBlock);
        checkAbortSignal(abortSignal);
        return ranges;
    }

    async addPriceHistoryRange(orderbook: Address, fromBlock: number, toBlock: number, abortSignal?: AbortSignal) {
        const tx = this._db.transaction('priceHistoryRanges', 'readwrite');
        const ranges = await this._getPriceHistoryRanges(tx, orderbook, fromBlock-1, toBlock+1);
        if (ranges.length) {
            fromBlock = Math.min(fromBlock, ranges[0].fromBlock);
            toBlock = Math.max(toBlock, ranges[ranges.length-1].toBlock);
            const keyRange = IDBKeyRange.bound([orderbook, fromBlock], [orderbook, toBlock]);
            await tx.store.delete(keyRange);
        }
        await tx.store.put({ orderbook, fromBlock, toBlock });
        await tx.done;
        checkAbortSignal(abortSignal);
    }

    async getPriceHistoryTicks(orderbook: Address, fromBlock: number, toBlock: number, abortSignal?: AbortSignal) {
        checkAbortSignal(abortSignal);
        const range = IDBKeyRange.bound([orderbook, fromBlock, 0], [orderbook, toBlock, Infinity]);
        const ticks = await this._db.getAll('priceHistoryTicks', range);
        checkAbortSignal(abortSignal);
        return ticks;
    }

    async savePriceHistoryTick(tick: CachedPriceHistoryTick, abortSignal?: AbortSignal) {
        await this._db.put('priceHistoryTicks', tick);
        checkAbortSignal(abortSignal);
    }

    async getOrders(owner: Address, abortSignal?: AbortSignal) {
        const range = IDBKeyRange.bound([owner, -Infinity], [owner, Infinity]);
        const orders = await this._db.getAllFromIndex('orders', 'byOwner', range);
        checkAbortSignal(abortSignal);
        return orders.reverse();
    }

    async getRecentOrders(owner: Address, count: number, abortSignal?: AbortSignal) {
        const range = IDBKeyRange.bound([owner, -Infinity], [owner, Infinity]);
        let cursor = await this._db.transaction('orders').store.index('byOwner').openCursor(range, 'prev');
        const orders: CachedOrder[] = [];
        while (cursor && count > 0) {
            orders.push(cursor.value);
            cursor = await cursor.continue();
            count--;
        }
        checkAbortSignal(abortSignal);
        return orders;
    }

    async getOrder(key: string, abortSignal?: AbortSignal) {
        const order = await this._db.get('orders', key);
        checkAbortSignal(abortSignal);
        if (!order) throw new CacheMiss;
        return order;
    }

    async getOpenOrders(owner: Address, abortSignal?: AbortSignal) {
        const range = IDBKeyRange.bound([owner, CachedOrderMainStatus.OPEN, -Infinity], [owner, CachedOrderMainStatus.OPEN, Infinity]);
        const orders = await this._db.getAllFromIndex('orders', 'byMainStatus', range);
        checkAbortSignal(abortSignal);
        return orders.reverse();
    }

    async getClosedOrders(owner: Address, abortSignal?: AbortSignal) {
        const range = IDBKeyRange.bound([owner, CachedOrderMainStatus.CLOSED, -Infinity], [owner, CachedOrderMainStatus.CLOSED, Infinity]);
        const orders = await this._db.getAllFromIndex('orders', 'byMainStatus', range);
        checkAbortSignal(abortSignal);
        return orders.reverse();
    }

    async saveOrder(order: Omit<CachedOrder, 'mainStatus'>, abortSignal?: AbortSignal) {
        const {
            key,
            owner,
            timestamp,
            orderbook,
            txHash,
            id,
            status,
            type,
            execution,
            price,
            totalPrice,
            totalPriceClaimed,
            amount,
            filled,
            claimed,
            canceled,
            error,
            claimTxHash,
            cancelTxHash,
        } = order;
        const mainStatus =
              status.includes(OrderStatus.PENDING) ? CachedOrderMainStatus.OPEN
            : status.includes(OrderStatus.OPEN) ? CachedOrderMainStatus.OPEN
            : CachedOrderMainStatus.CLOSED;
        await this._db.put('orders', {
            key,
            owner,
            timestamp,
            orderbook,
            txHash,
            id,
            mainStatus,
            status,
            type,
            execution,
            price,
            totalPrice,
            totalPriceClaimed,
            amount,
            filled,
            claimed,
            canceled,
            error,
            claimTxHash,
            cancelTxHash,
        });
        checkAbortSignal(abortSignal);
    }

    async deleteOrder(key: CachedOrder['key'], abortSignal?: AbortSignal) {
        await this._db.delete('orders', key);
        checkAbortSignal(abortSignal);
    }
}

export class CacheMiss extends Error {
    constructor() {
        super('Cache Miss');
        this.name = 'CacheMiss';
    }
}

export interface CachedBlock {
    blockNumber: number;
    timestamp: number;
}

export interface CachedToken {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
}

export interface CachedOrderbook {
    address: Address;
    version: bigint;
    tradedToken: Address;
    baseToken: Address;
    contractSize: bigint;
    priceTick: bigint;
    creationBlockNumber: number;
    factory?: Address;
    factoryIndex?: number;
}

export interface CachedPriceHistoryRange {
    orderbook: Address;
    fromBlock: number;
    toBlock: number;
}

export interface CachedPriceHistoryTick {
    readonly orderbook: string;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly price: bigint;
}

export enum CachedOrderMainStatus {
    OPEN,
    CLOSED,
}

export interface CachedOrder {
    key: string;
    owner: Address;
    timestamp: number;
    orderbook: Address;
    txHash: string;
    id: bigint;
    mainStatus: CachedOrderMainStatus;
    status: readonly OrderStatus[];
    type: OrderType;
    execution: OrderExecutionType;
    price: bigint;
    totalPrice: bigint;
    totalPriceClaimed: bigint;
    amount: bigint;
    filled: bigint;
    claimed: bigint;
    canceled: bigint;
    error: string;
    claimTxHash: string;
    cancelTxHash: string;
}

interface CacheV3 extends DBSchema {
    blocks: {
        key: CachedBlock['blockNumber'];
        value: CachedBlock;
    },
    tokens: {
        key: CachedToken['address'];
        value: CachedToken;
    },
    orderbooks: {
        key: CachedOrderbook['address'];
        value: CachedOrderbook;
        indexes: {
            byFactoryIndex: [
                NonNullable<CachedOrderbook['factory']>,
                NonNullable<CachedOrderbook['factoryIndex']>,
            ];
        };
    },
    priceHistoryRanges: {
        key: [
            CachedPriceHistoryRange['orderbook'],
            CachedPriceHistoryRange['toBlock'],
        ];
        value: CachedPriceHistoryRange;
    },
    priceHistoryTicks: {
        key: [
            CachedPriceHistoryTick['orderbook'],
            CachedPriceHistoryTick['blockNumber'],
            CachedPriceHistoryTick['logIndex'],
        ];
        value: CachedPriceHistoryTick;
    },
    orders: {
        key: CachedOrder['key'];
        value: CachedOrder;
        indexes: {
            byOwner: [
                CachedOrder['owner'],
                CachedOrder['timestamp'],
            ];
            byMainStatus: [
                CachedOrder['owner'],
                CachedOrder['mainStatus'],
                CachedOrder['timestamp'],
            ];
        };
    },
}
