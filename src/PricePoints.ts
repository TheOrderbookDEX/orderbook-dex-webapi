import { ContractEvent, getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { IOrderbookV1, Placed, Filled, Canceled } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { Address } from './Address';
import { ChainEvents } from './ChainEvents';
import { GenericEventListener } from './event-types';
import { EventTargetX } from './EventTargetX';
import { OrderType } from './Order';
import { checkAbortSignal, isAbortReason } from './utils';

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
    abstract get sell(): PricePoint[];

    /**
     * Buy price points.
     */
    abstract get buy(): PricePoint[];

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
const BUY = 1;

export class PricePointsInternal extends PricePoints {
    static async create(address: Address, limit: number, abortSignal?: AbortSignal) {
        const orderbook = IOrderbookV1.at(address);
        const blockTag = await getBlockNumber();
        const sell: PricePoint[] = [];
        let price = await orderbook.askPrice({ blockTag });
        checkAbortSignal(abortSignal);
        while (price) {
            const pricePoint = await orderbook.pricePoint(SELL, price, { blockTag });
            checkAbortSignal(abortSignal);
            const available = pricePoint.totalPlaced - pricePoint.totalFilled;
            sell.push({ price, available });
            price = await orderbook.nextSellPrice(price);
            checkAbortSignal(abortSignal);
        }
        const buy: PricePoint[] = [];
        price = await orderbook.bidPrice({ blockTag });
        checkAbortSignal(abortSignal);
        while (price) {
            const pricePoint = await orderbook.pricePoint(BUY, price, { blockTag });
            checkAbortSignal(abortSignal);
            const available = pricePoint.totalPlaced - pricePoint.totalFilled;
            buy.push({ price, available });
            price = await orderbook.nextBuyPrice(price);
            checkAbortSignal(abortSignal);
        }
        return new PricePointsInternal(address, blockTag, limit, sell, buy);
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

    get sell(): PricePoint[] {
        return this._sell.slice(0, this._limit);
    }

    get buy(): PricePoint[] {
        return this._buy.slice(0, this._limit);
    }

    private _updaterAbortController?: AbortController;

    protected _activateUpdater() {
        this._updaterAbortController = new AbortController();
        const abortSignal = this._updaterAbortController.signal;
        const address = this._address;
        const fromBlock = this._sinceBlock + 1;
        void (async () => {
            try {
                const toBlock = ChainEvents.instance.latestBlockNumber;
                checkAbortSignal(abortSignal);
                const pendingEvents: ContractEvent[] = [];
                let onEvent: (event: ContractEvent) => void;
                onEvent = event => pendingEvents.push(event);
                const listener = (event: ContractEvent) => onEvent(event);
                ChainEvents.instance.on(address, listener);
                abortSignal.addEventListener('abort', () => ChainEvents.instance.off(address, listener), { once: true });
                if (fromBlock <= toBlock) {
                    for await (const event of ContractEvent.get({ address, fromBlock, toBlock, events: [ Placed, Filled, Canceled ] })) {
                        this._update(event);
                    }
                    checkAbortSignal(abortSignal);
                }
                for (const event of pendingEvents) {
                    this._update(event);
                }
                onEvent = event => this._update(event);
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
    price: bigint;

    /**
     * The amount of contracts available.
     */
    available: bigint;
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
