import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb';
import { Address } from './Address';
import { Chain } from './Chain';
import { OrderInternal, OrderExecutionType, OrderStatus, OrderType } from './Order';
import { OrderbookInternal } from './Orderbook';
import { PriceHistoryTickInternal } from './PriceHistory';
import { Token } from './Token';
import { checkAbortSignal } from './utils';

export class Cache {
    private static _instance?: Cache;

    static async load() {
        if (!this._instance) {
            const chainId = Chain.instance.chainId;
            const db = await openDB<CacheV1>(`Cache${chainId}`, 1, {
                async upgrade(db, version) {
                    if (version < 1) {
                        db.createObjectStore('blocks', {
                            keyPath: 'blockNumber',
                        });
                        db.createObjectStore('tokens', {
                            keyPath: 'address',
                        });
                        db.createObjectStore('orderbooks', {
                            keyPath: 'address',
                        });
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
                        orders.createIndex('byMainStatus', ['owner', 'mainStatus'], { unique: false });
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
        delete this._instance;
    }

    constructor(private readonly _db: IDBPDatabase<CacheV1>) {}

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
        return new Token(token);
    }

    async saveToken(token: Token, abortSignal?: AbortSignal) {
        const { address, name, symbol, decimals } = token;
        await this._db.put('tokens', { address, name, symbol, decimals });
        checkAbortSignal(abortSignal);
        return token;
    }

    async getOrderbook(address: Address, abortSignal?: AbortSignal) {
        checkAbortSignal(abortSignal);
        const orderbook = await this._db.get('orderbooks', address);
        checkAbortSignal(abortSignal);
        if (!orderbook) throw new CacheMiss;
        const tradedToken = await this.getToken(orderbook.tradedToken, abortSignal);
        const baseToken = await this.getToken(orderbook.baseToken, abortSignal);
        return new OrderbookInternal({ ...orderbook, tradedToken, baseToken });
    }

    async saveOrderbook(orderbook: OrderbookInternal, abortSignal?: AbortSignal) {
        const {
            address,
            version,
            contractSize,
            priceTick,
            creationBlockNumber,
            tradedToken: { address: tradedToken },
            baseToken: { address: baseToken },
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
        return orderbook;
    }

    private async _getPriceHistoryRanges(
        tx: IDBPTransaction<CacheV1, ['priceHistoryRanges'], 'readonly' | 'readwrite'>,
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

    async savePriceHistoryTick(tick: PriceHistoryTickInternal, abortSignal?: AbortSignal) {
        await this._db.put('priceHistoryTicks', tick);
        checkAbortSignal(abortSignal);
        return tick;
    }

    async * getOrders(owner: Address, abortSignal?: AbortSignal): AsyncIterable<OrderInternal> {
        const range = IDBKeyRange.bound([owner, 0], [owner, Infinity]);
        const orders = await this._db.getAllFromIndex('orders', 'byOwner', range);
        checkAbortSignal(abortSignal);
        for (const order of orders.reverse()) {
            const orderbook = await this.getOrderbook(order.orderbook, abortSignal);
            yield { ...order, orderbook };
        }
    }

    async getOrder(key: string, abortSignal?: AbortSignal): Promise<OrderInternal> {
        const order = await this._db.get('orders', key);
        checkAbortSignal(abortSignal);
        if (!order) throw new CacheMiss;
        const orderbook = await this.getOrderbook(order.orderbook, abortSignal);
        checkAbortSignal(abortSignal);
        return { ...order, orderbook };
    }

    async * getOpenOrders(owner: Address, abortSignal?: AbortSignal): AsyncIterable<OrderInternal> {
        const orders = await this._db.getAllFromIndex('orders', 'byMainStatus', [owner, Status.OPEN]);
        checkAbortSignal(abortSignal);
        for (const order of orders.reverse()) {
            const orderbook = await this.getOrderbook(order.orderbook, abortSignal);
            yield { ...order, orderbook };
        }
    }

    async saveOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        const {
            key,
            owner,
            timestamp,
            orderbook: { address: orderbook },
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
              status.includes(OrderStatus.PENDING) ? Status.OPEN
            : status.includes(OrderStatus.OPEN) ? Status.OPEN
            : Status.CLOSED;
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
        return order;
    }

    async deleteOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        await this._db.delete('orders', order.key);
        checkAbortSignal(abortSignal);
    }
}

export class CacheMiss extends Error {
    constructor() {
        super('Cache Miss');
        this.name = 'CacheMiss';
    }
}

enum Status {
    OPEN,
    CLOSED,
}

interface CacheV1 extends DBSchema {
    blocks: {
        key: number;
        value: {
            blockNumber: number;
            timestamp: number;
        };
    },
    tokens: {
        key: Address;
        value: {
            address: Address;
            name: string;
            symbol: string;
            decimals: number;
        };
    },
    orderbooks: {
        key: Address;
        value: {
            address: Address;
            version: bigint;
            tradedToken: Address;
            baseToken: Address;
            contractSize: bigint;
            priceTick: bigint;
            creationBlockNumber: number;
        };
    },
    priceHistoryRanges: {
        key: [Address, number];
        value: {
            orderbook: Address;
            fromBlock: number;
            toBlock: number;
        };
    },
    priceHistoryTicks: {
        key: [Address, number, number];
        value: PriceHistoryTickInternal;
    },
    orders: {
        key: string;
        value: {
            key: string;
            owner: Address;
            timestamp: number;
            orderbook: Address;
            txHash: string;
            id: string;
            mainStatus: Status;
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
        };
        indexes: {
            byOwner: [Address, number];
            byMainStatus: [Address, Status];
        };
    },
}
