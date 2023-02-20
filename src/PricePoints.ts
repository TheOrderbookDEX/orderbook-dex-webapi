import { ContractEvent, getBlockNumber } from '@frugalwizard/abi2ts-lib';
import { IOperatorV1 } from '@theorderbookdex/orderbook-dex-v1-operator/dist/interfaces/IOperatorV1';
import { Placed, Filled, Canceled } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { Address } from './Address';
import { ChainEvents } from './ChainEvents';
import { GenericEventListener } from './event-types';
import { EventTargetX } from './EventTargetX';
import { OrderType } from './Order';
import { OrderbookDEXInternal } from './OrderbookDEX';
import { isAbortReason } from './utils';

export enum PricePointsEventType {
    /**
     * Event type dispatched when a price point gets updated.
     */
    PRICE_POINT_UPDATED = 'pricePointUpdated',

    /**
     * Event type dispatched when a price point is added to the list.
     */
    PRICE_POINT_ADDED = 'pricePointAdded',

    /**
     * Event type dispatched when a price point is removed from the list.
     */
    PRICE_POINT_REMOVED = 'pricePointRemoved',
}

/**
 * Orderbook price points.
 */
export abstract class PricePoints extends EventTargetX {

    /**
     * Sell price points.
     */
    abstract get sell(): readonly PricePoint[];

    /**
     * Buy price points.
     */
    abstract get buy(): readonly PricePoint[];

    addEventListener(type: PricePointsEventType.PRICE_POINT_ADDED, callback: GenericEventListener<PricePointAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: PricePointsEventType.PRICE_POINT_REMOVED, callback: GenericEventListener<PricePointRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: PricePointsEventType.PRICE_POINT_UPDATED, callback: GenericEventListener<PricePointUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: PricePointsEventType, callback: GenericEventListener<PricePointsEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: PricePointsEventType.PRICE_POINT_ADDED, callback: GenericEventListener<PricePointAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: PricePointsEventType.PRICE_POINT_REMOVED, callback: GenericEventListener<PricePointRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: PricePointsEventType.PRICE_POINT_UPDATED, callback: GenericEventListener<PricePointUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: PricePointsEventType, callback: GenericEventListener<PricePointsEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    protected constructor() {
        super();
    }
}

const SELL = 0;

export class PricePointsInternal extends PricePoints {
    static async create(address: Address, limit: number, abortSignal?: AbortSignal) {
        const blockTag = await getBlockNumber(abortSignal);

        const { sell, buy } = await this.fetch(address, blockTag, abortSignal);

        return new PricePointsInternal(address, blockTag, limit, sell, buy);
    }

    private static readonly FETCH_BATCH = 10;

    private static async fetch(address: Address, blockTag: number, abortSignal?: AbortSignal) {
        const operatorV1 = IOperatorV1.at(OrderbookDEXInternal.instance._config.operatorV1);

        let sellDone = false;
        let buyDone = false;

        const sell: PricePoint[] = [];
        const buy: PricePoint[] = [];

        let prevSellPrice = 0n
        let prevBuyPrice = 0n

        while (!sellDone || !buyDone) {
            const result = await operatorV1.pricePointsV1(
                address,
                prevSellPrice,
                sellDone ? 0 : this.FETCH_BATCH,
                prevBuyPrice,
                buyDone ? 0 : this.FETCH_BATCH,
                { blockTag, abortSignal }
            );

            sell.push(...result.sell.map(([ price, available ]) => ({ price, available })));

            if (result.sell.length) {
                prevSellPrice = result.sell[result.sell.length-1][0];
            }

            if (result.sell.length < this.FETCH_BATCH) {
                sellDone = true;
            }

            buy.push(...result.buy.map(([ price, available ]) => ({ price, available })));

            if (result.buy.length) {
                prevBuyPrice = result.buy[result.buy.length-1][0];
            }

            if (result.buy.length < this.FETCH_BATCH) {
                buyDone = true;
            }
        }

        return { sell, buy };
    }

    constructor(
        private readonly _address: Address,
        private _sinceBlock: number,
        private readonly _limit: number,
        private readonly _sell: PricePoint[],
        private readonly _buy: PricePoint[],
    ) {
        super();
    }

    get sell(): readonly PricePoint[] {
        return this._sell.slice(0, this._limit);
    }

    get buy(): readonly PricePoint[] {
        return this._buy.slice(0, this._limit);
    }

    private _updaterAbortController?: AbortController;

    protected _activateUpdater() {
        this._updaterAbortController = new AbortController();

        const abortSignal = this._updaterAbortController.signal;
        const address = this._address;
        const fromBlock = this._sinceBlock + 1;
        const toBlock = ChainEvents.instance.latestBlockNumber;
        const feed = ChainEvents.instance.feed(address, abortSignal);
        const backlog = ContractEvent.get({ address, fromBlock, toBlock }, abortSignal);

        void (async () => {
            try {
                for await (const event of backlog) {
                    this._update(event);
                }

                for await (const event of feed) {
                    this._update(event);
                }

            } catch (error) {
                if (!isAbortReason(abortSignal, error)) {
                    throw error;
                }
            }
        })();
    }

    protected _deactivateUpdater() {
        this._updaterAbortController?.abort();
        this._updaterAbortController = undefined;
    }

    private _update(event: ContractEvent) {
        this._sinceBlock = event.blockNumber;

        if (event instanceof Placed) {
            this._increase(event.orderType, event.price, event.amount);

        } else if (event instanceof Filled || event instanceof Canceled) {
            this._decrease(event.orderType, event.price, event.amount);
        }
    }

    private _increase(type: number, price: bigint, amount: bigint) {
        const pricePoints = type == SELL ? this._sell : this._buy;
        const index = pricePoints.findIndex(pricePoint => type == SELL ? pricePoint.price >= price : pricePoint.price <= price);
        const orderType = type == SELL ? OrderType.SELL : OrderType.BUY;

        if (index >= 0) {
            if (pricePoints[index].price == price) {
                const available = pricePoints[index].available + amount;
                pricePoints[index] = { price, available };
                if (index < this._limit) {
                    this.dispatchEvent(new PricePointUpdatedEvent(orderType, price, available));
                }

            } else {
                pricePoints.splice(index, 0, { price, available: amount });
                if (index < this._limit) {
                    if (pricePoints.length > this._limit) {
                        this.dispatchEvent(new PricePointRemovedEvent(orderType, pricePoints[this._limit].price));
                    }

                    this.dispatchEvent(new PricePointAddedEvent(orderType, price, amount));
                }
            }

        } else {
            pricePoints.push({ price, available: amount });

            if (pricePoints.length <= this._limit) {
                this.dispatchEvent(new PricePointAddedEvent(orderType, price, amount));
            }
        }
    }

    private _decrease(type: number, price: bigint, amount: bigint) {
        const pricePoints = type == SELL ? this._sell : this._buy;
        const index = pricePoints.findIndex(pricePoint => pricePoint.price == price);
        const orderType = type == SELL ? OrderType.SELL : OrderType.BUY;

        if (index >= 0) {
            const available = pricePoints[index].available - amount;

            if (available > 0) {
                pricePoints[index] = { price, available };

                if (index < this._limit) {
                    this.dispatchEvent(new PricePointUpdatedEvent(orderType, price, available));
                }

            } else {
                pricePoints.splice(index, 1);

                if (index < this._limit) {
                    this.dispatchEvent(new PricePointRemovedEvent(orderType, price));

                    if (pricePoints.length >= this._limit) {
                        const { price, available } = pricePoints[this._limit-1];
                        this.dispatchEvent(new PricePointAddedEvent(orderType, price, available));
                    }
                }
            }
        }
    }
}

/**
 * An orderbook price point.
 */
export interface PricePoint {
    /**
     * The price in base token.
     */
    readonly price: bigint;

    /**
     * The amount of contracts available.
     */
    readonly available: bigint;
}

/**
 * Event dispatched from PricePoints.
 */
export abstract class PricePointsEvent extends Event {
    constructor(type: PricePointsEventType) {
        super(type);
    }
}

/**
 * Event dispatched when a price point gets updated.
 */
export class PricePointUpdatedEvent extends PricePointsEvent {
    /**
     * The order type.
     */
    readonly orderType: OrderType;

    /**
     * The price.
     */
    readonly price: bigint;

    /**
     * The updated amount of available contracts.
     */
    readonly available: bigint;

    /** @internal */
    constructor(orderType: OrderType, price: bigint, available: bigint) {
        super(PricePointsEventType.PRICE_POINT_UPDATED);
        this.orderType = orderType;
        this.price = price;
        this.available = available;
    }
}

/**
 * Event dispatched when a price point is added to the list.
 */
export class PricePointAddedEvent extends PricePointsEvent {
    /**
     * The order type.
     */
    readonly orderType: OrderType;

    /**
     * The price.
     */
    readonly price: bigint;

    /**
     * The new amount of available contracts.
     */
    readonly available: bigint;

    /** @internal */
    constructor(orderType: OrderType, price: bigint, available: bigint) {
        super(PricePointsEventType.PRICE_POINT_ADDED);
        this.orderType = orderType;
        this.price = price;
        this.available = available;
    }
}

/**
 * Event dispatched when a price point is removed from the list.
 */
export class PricePointRemovedEvent extends PricePointsEvent {
    /**
     * The order type.
     */
    readonly orderType: OrderType;

    /**
     * The price.
     */
    readonly price: bigint;

    /** @internal */
    constructor(orderType: OrderType, price: bigint) {
        super(PricePointsEventType.PRICE_POINT_REMOVED);
        this.orderType = orderType;
        this.price = price;
    }
}
