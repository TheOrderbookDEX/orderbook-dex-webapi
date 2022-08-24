import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb';
import { Address } from './Address';
import { OrderExecutionType, OrderStatus, OrderType } from './Order';
import { checkAbortSignal } from './utils';

export class Cache {
    private static _instance?: Cache;

    static async load(chainId: number, version?: number) {
        if (!this._instance) {
            if (!version || version > 2) version = 2;
            const db = await openDB<CacheV2>(`Cache${chainId}`, version, {
                async upgrade(db, oldVersion, newVersion: number, tx) {
                    if (oldVersion < 1 && newVersion >= 1) {
                        const v1db = db as unknown as IDBPDatabase<CacheV1>;
                        v1db.createObjectStore('blocks', {
                            keyPath: 'blockNumber',
                        });
                        v1db.createObjectStore('tokens', {
                            keyPath: 'address',
                        });
                        v1db.createObjectStore('orderbooks', {
                            keyPath: 'address',
                        });
                        v1db.createObjectStore('priceHistoryRanges', {
                            keyPath: ['orderbook', 'toBlock'],
                        });
                        v1db.createObjectStore('priceHistoryTicks', {
                            keyPath: ['orderbook', 'blockNumber', 'logIndex'],
                        });
                        const orders = v1db.createObjectStore('orders', {
                            keyPath: 'key',
                        });
                        orders.createIndex('byOwner', ['owner', 'timestamp'], { unique: false });
                        if (newVersion == 1) {
                            orders.createIndex('byMainStatus', ['owner', 'mainStatus'], { unique: false });
                        }
                    }
                    if (oldVersion < 2 && newVersion >= 2) {
                        const orders = tx.objectStore('orders');
                        if (oldVersion == 1) {
                            orders.deleteIndex('byMainStatus');
                        }
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

    constructor(private readonly _db: IDBPDatabase<CacheV2>) {}

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
            contractSize,
            priceTick,
            creationBlockNumber,
            tradedToken,
            baseToken,
        } = orderbook;
        await this._db.put('orderbooks', {
            address,
            version,
            tradedToken,
            baseToken,
            contractSize,
            priceTick,
            creationBlockNumber,
        });
        checkAbortSignal(abortSignal);
    }

    private async _getPriceHistoryRanges(
        tx: IDBPTransaction<CacheV2, ['priceHistoryRanges'], 'readonly' | 'readwrite'>,
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
    id: string;
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

interface CacheV1 extends DBSchema {
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
            ];
        };
    },
}

interface CacheV2 extends DBSchema {
    blocks: CacheV1['blocks'],
    tokens: CacheV1['tokens'],
    orderbooks: CacheV1['orderbooks'],
    priceHistoryRanges: CacheV1['priceHistoryRanges'],
    priceHistoryTicks: CacheV1['priceHistoryTicks'],
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
