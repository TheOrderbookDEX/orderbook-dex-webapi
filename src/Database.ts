import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb';
import { Address } from './Address';
import { OrderExecutionType, OrderStatus, OrderType } from './Order';
import { checkAbortSignal, createAbortifier } from './utils';

export class Database {
    private static _instance?: Database;

    static async load(chainId: number, version?: number) {
        if (!this._instance) {
            if (!version || version > 1) version = 1;
            const db = await openDB<DatabaseSchemaV1>(`Database${chainId}`, version, {
                async upgrade(db, oldVersion, newVersion: number) {
                    if (newVersion >= 1) {
                        db.createObjectStore('settings', {
                            keyPath: 'name',
                        });
                        db.createObjectStore('blocks', {
                            keyPath: 'blockNumber',
                        });
                        const tokens = db.createObjectStore('tokens', {
                            keyPath: 'address',
                        });
                        tokens.createIndex('tracked', ['tracked', 'address']);
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
            this._instance = new Database(db);
        }
    }

    static get instance() {
        if (!this._instance) {
            throw new Error('Database not loaded');
        }
        return this._instance;
    }

    static unload() {
        if (this._instance) {
            this._instance._db.close();
            delete this._instance;
        }
    }

    constructor(private readonly _db: IDBPDatabase<DatabaseSchemaV1>) {}

    async getSetting<T extends keyof Settings>(name: T, abortSignal?: AbortSignal): Promise<Settings[T] | undefined> {
        const abortify = createAbortifier(abortSignal);
        return (await abortify(this._db.get('settings', name)))?.value as Settings[T];
    }

    async setSetting<T extends keyof Settings>(name: T, value: Settings[T], abortSignal?: AbortSignal): Promise<void> {
        const abortify = createAbortifier(abortSignal);
        await abortify(this._db.put('settings', { name, value }));
    }

    async getBlockTimestamp(blockNumber: number, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const block = await abortify(this._db.get('blocks', blockNumber));
        if (!block) throw new NotInDatabase;
        return block.timestamp;
    }

    async saveBlockTimestamp(blockNumber: number, timestamp: number, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        await abortify(this._db.put('blocks', { blockNumber, timestamp }));
        return timestamp;
    }

    async * getTrackedTokens(abortSignal?: AbortSignal): AsyncIterable<TokenData> {
        const abortify = createAbortifier(abortSignal);
        // TODO fetch the tokens in batches
        // in indexeddb string < array, that's why we use an empty array for they query
        const query = IDBKeyRange.bound([TrackedFlag.TRACKED], [TrackedFlag.TRACKED, []]);
        for (const token of await abortify(this._db.getAllFromIndex('tokens', 'tracked', query))) {
            yield token;
        }
    }

    async getToken(address: Address, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const token = await abortify(this._db.get('tokens', address));
        if (!token) throw new NotInDatabase;
        return token;
    }

    async saveToken(token: TokenData, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const { tracked, address, name, symbol, decimals } = token;
        await abortify(this._db.put('tokens', { tracked, address, name, symbol, decimals }));
    }

    static readonly GET_ORDERBOOKS_BATCH = 10;

    async * getOrderbooks(factory: Address, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const lastIndex = await this.getLastFactoryIndex(factory, abortSignal);
        if (!lastIndex) return;
        // due to how indexeddb works, we first fetch a batch then yield it
        for (let index = 0; index <= lastIndex; index += Database.GET_ORDERBOOKS_BATCH) {
            const query = IDBKeyRange.bound([factory, index], [factory, index + Database.GET_ORDERBOOKS_BATCH - 1]);
            for (const orderbook of await abortify(this._db.getAllFromIndex('orderbooks', 'byFactoryIndex', query))) {
                yield orderbook;
            }
        }
    }

    async getLastFactoryIndex(factory: Address, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const query = IDBKeyRange.bound([factory], [factory, Infinity]);
        const cursor = await abortify(this._db.transaction('orderbooks').store.index('byFactoryIndex').openCursor(query, 'prev'));
        return cursor?.value.factoryIndex;
    }

    async getOrderbook(address: Address, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const orderbook = await abortify(this._db.get('orderbooks', address));
        if (!orderbook) throw new NotInDatabase;
        return orderbook;
    }

    async saveOrderbook(orderbook: OrderbookData, abortSignal?: AbortSignal) {
        const abortify = createAbortifier(abortSignal);
        const {
            tracked,
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
        await abortify(this._db.put('orderbooks', {
            tracked,
            address,
            version,
            tradedToken,
            baseToken,
            contractSize,
            priceTick,
            creationBlockNumber,
            factory,
            factoryIndex,
        }));
    }

    private async _getPriceHistoryRanges(
        tx: IDBPTransaction<DatabaseSchemaV1, ['priceHistoryRanges'], 'readonly' | 'readwrite'>,
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

    async savePriceHistoryTick(tick: PriceHistoryTickData, abortSignal?: AbortSignal) {
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
        const orders: OrderData[] = [];
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
        if (!order) throw new NotInDatabase;
        return order;
    }

    async getOpenOrders(owner: Address, abortSignal?: AbortSignal) {
        const range = IDBKeyRange.bound([owner, OrderMainStatus.OPEN, -Infinity], [owner, OrderMainStatus.OPEN, Infinity]);
        const orders = await this._db.getAllFromIndex('orders', 'byMainStatus', range);
        checkAbortSignal(abortSignal);
        return orders.reverse();
    }

    async getClosedOrders(owner: Address, abortSignal?: AbortSignal) {
        const range = IDBKeyRange.bound([owner, OrderMainStatus.CLOSED, -Infinity], [owner, OrderMainStatus.CLOSED, Infinity]);
        const orders = await this._db.getAllFromIndex('orders', 'byMainStatus', range);
        checkAbortSignal(abortSignal);
        return orders.reverse();
    }

    async saveOrder(order: Omit<OrderData, 'mainStatus'>, abortSignal?: AbortSignal) {
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
              status.includes(OrderStatus.PENDING) ? OrderMainStatus.OPEN
            : status.includes(OrderStatus.OPEN) ? OrderMainStatus.OPEN
            : OrderMainStatus.CLOSED;
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

    async deleteOrder(key: OrderData['key'], abortSignal?: AbortSignal) {
        await this._db.delete('orders', key);
        checkAbortSignal(abortSignal);
    }
}

export class NotInDatabase extends Error {
    constructor() {
        super('Not In Database');
        this.name = 'NotInDatabase';
    }
}

export interface Settings {
    tokensInitialized: boolean;
    orderbooksInitialized: boolean;
}

export interface BlockData {
    blockNumber: number;
    timestamp: number;
}

export enum TrackedFlag {
    NOT_TRACKED,
    TRACKED,
}

export interface TokenData {
    tracked: TrackedFlag;
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
}

export interface OrderbookData {
    tracked: TrackedFlag;
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

export interface PriceHistoryRangeData {
    orderbook: Address;
    fromBlock: number;
    toBlock: number;
}

export interface PriceHistoryTickData {
    readonly orderbook: string;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly price: bigint;
}

export enum OrderMainStatus {
    OPEN,
    CLOSED,
}

export interface OrderData {
    key: string;
    owner: Address;
    timestamp: number;
    orderbook: Address;
    txHash: string;
    id: bigint;
    mainStatus: OrderMainStatus;
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

interface DatabaseSchemaV1 extends DBSchema {
    settings: {
        key: string;
        value: {
            name: string;
            value: unknown;
        };
    },
    blocks: {
        key: BlockData['blockNumber'];
        value: BlockData;
    },
    tokens: {
        key: TokenData['address'];
        value: TokenData;
        indexes: {
            tracked: [
                TokenData['tracked'],
                TokenData['address'],
            ];
        };
    },
    orderbooks: {
        key: OrderbookData['address'];
        value: OrderbookData;
        indexes: {
            byFactoryIndex: [
                NonNullable<OrderbookData['factory']>,
                NonNullable<OrderbookData['factoryIndex']>,
            ];
        };
    },
    priceHistoryRanges: {
        key: [
            PriceHistoryRangeData['orderbook'],
            PriceHistoryRangeData['toBlock'],
        ];
        value: PriceHistoryRangeData;
    },
    priceHistoryTicks: {
        key: [
            PriceHistoryTickData['orderbook'],
            PriceHistoryTickData['blockNumber'],
            PriceHistoryTickData['logIndex'],
        ];
        value: PriceHistoryTickData;
    },
    orders: {
        key: OrderData['key'];
        value: OrderData;
        indexes: {
            byOwner: [
                OrderData['owner'],
                OrderData['timestamp'],
            ];
            byMainStatus: [
                OrderData['owner'],
                OrderData['mainStatus'],
                OrderData['timestamp'],
            ];
        };
    },
}
