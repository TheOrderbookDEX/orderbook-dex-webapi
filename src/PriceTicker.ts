import { GenericEventListener } from './event-types';
import { isAbortReason } from './utils';
import { fetchLast24hsPriceHistoryTicks, fetchPriceHistoryTicks, listenToPriceHistoryTicks, PriceHistoryTickInternal, TimeFrame } from './PriceHistory';
import { EventTargetX } from './EventTargetX';
import { after, now } from './time';
import { ChainEvents } from './ChainEvents';
import { getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { Address } from './Address';

export enum PriceTickerEventType {
    /**
     * Event type dispatched when price changes.
     */
    PRICE_CHANGED = 'priceChanged',
}

/**
 * An interface to get the latest prices for an orderbook.
 */
export abstract class PriceTicker extends EventTargetX {
    /**
     * The last price traded in base token.
     */
    abstract get lastPrice(): bigint | undefined;

    /**
     * How much the price changed in the last 24 hours.
     *
     * Multiply this value by 100 to get a percentage.
     */
    abstract get priceChange(): number | undefined;

    addEventListener(type: PriceTickerEventType.PRICE_CHANGED, callback: GenericEventListener<PriceChangedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: PriceTickerEventType, callback: GenericEventListener<PriceTickerEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: PriceTickerEventType.PRICE_CHANGED, callback: GenericEventListener<PriceChangedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: PriceTickerEventType, callback: GenericEventListener<PriceTickerEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    /** @internal */
    dispatchEvent(event: PriceTickerEvent): boolean {
        return super.dispatchEvent(event);
    }

    protected constructor() {
        super();
    }
}

export class PriceTickerInternal extends PriceTicker {
    static async create(address: Address, abortSignal?: AbortSignal) {
        const sinceBlock = await getBlockNumber();
        const ticks = new Array<PriceHistoryTickInternal>();
        for await (const tick of fetchLast24hsPriceHistoryTicks(address, sinceBlock, abortSignal)) {
            ticks.push(tick);
        }
        ticks.reverse();
        return new PriceTickerInternal(address, sinceBlock, ticks);
    }

    get lastPrice() {
        if (!this._last24hsTicks.length) return;
        return this._last24hsTicks[this._last24hsTicks.length - 1].price;
    }

    get lastPrice24hsAgo() {
        if (!this._last24hsTicks.length) return;
        const aDayAgo = now() - (TimeFrame.DAY as number);
        if (this._last24hsTicks[0].timestamp > aDayAgo) return;
        return this._last24hsTicks[0].price;
    }

    get priceChange() {
        const { lastPrice, lastPrice24hsAgo } = this;
        if (!lastPrice || !lastPrice24hsAgo) return;
        return Number(lastPrice * 1000000n / lastPrice24hsAgo) / 1000000 - 1;
    }

    constructor(
        private readonly _address: Address,
        private _sinceBlock: number,
        private _last24hsTicks: PriceHistoryTickInternal[],
    ) {
        super();
    }

    private _updaterAbortController?: AbortController;
    private _updateTimerAbort?: ReturnType<typeof after>;
    private _waitForListener?: (() => Promise<void>);

    protected _activateUpdater() {
        this._update();
        this._updaterAbortController = new AbortController();
        const abortSignal = this._updaterAbortController.signal;
        void (async () => {
            try {
                const fromBlock = this._sinceBlock + 1;
                const toBlock = ChainEvents.instance.latestBlockNumber;
                const pendingTicks: PriceHistoryTickInternal[] = [];
                let onTick: (tick: PriceHistoryTickInternal) => void;
                onTick = tick => pendingTicks.push(tick);
                this._waitForListener = listenToPriceHistoryTicks(this._address, abortSignal, tick => onTick(tick));
                if (fromBlock <= toBlock) {
                    for (const tick of await fetchPriceHistoryTicks(this._address, fromBlock, toBlock, abortSignal)) {
                        this._update(tick);
                    }
                }
                for (const tick of pendingTicks) {
                    this._update(tick);
                }
                onTick = tick => this._update(tick);
            } catch (error) {
                if (!isAbortReason(abortSignal, error)) {
                    throw error;
                }
            }
        })();
    }

    protected _deactivateUpdater(): void {
        this._updaterAbortController?.abort();
        if (this._updateTimerAbort) this._updateTimerAbort();
        delete this._updaterAbortController;
        delete this._updateTimerAbort;
        delete this._waitForListener;
    }

    private _prevPrice?: bigint;
    private _prevPriceChange?: number;

    private _update(tick?: PriceHistoryTickInternal) {
        if (this._updateTimerAbort) {
            this._updateTimerAbort();
            delete this._updateTimerAbort;
        }
        if (tick) {
            this._sinceBlock = tick.blockNumber;
            this._last24hsTicks.push(tick);
        }
        const aDayAgo = now() - (TimeFrame.DAY as number);
        while (this._last24hsTicks[1]?.timestamp <= aDayAgo) {
            this._last24hsTicks.shift();
        }
        if (this._last24hsTicks[0]?.timestamp > aDayAgo) {
            this._updateTimerAbort = after(this._last24hsTicks[0].timestamp - aDayAgo, () => this._update());
        } else if (this._last24hsTicks[1]) {
            this._updateTimerAbort = after(this._last24hsTicks[1].timestamp - aDayAgo, () => this._update());
        }
        const newPrice = this.lastPrice;
        if (newPrice) {
            const newPriceChange = this.priceChange;
            if (newPrice !== this._prevPrice || newPriceChange !== this._prevPriceChange) {
                this._prevPrice = newPrice;
                this._prevPriceChange = newPriceChange;
                this.dispatchEvent(new PriceChangedEvent(newPrice, newPriceChange));
            }
        }
    }

    public async _waitForUpdater() {
        if (this._waitForListener) await this._waitForListener();
    }
}

/**
 * Event dispatched from PriceTicker.
 */
export abstract class PriceTickerEvent extends Event {
    constructor(type: PriceTickerEventType) {
        super(type);
    }
}

/**
 * Event dispatched when an orderbook changed its last price.
 */
export class PriceChangedEvent extends PriceTickerEvent {
    /**
     * The new price.
     */
    readonly newPrice: bigint;

    /**
     * How much the price changed in the last 24 hours.
     */
    readonly priceChange: number | undefined;

    /** @internal */
    constructor(newPrice: bigint, priceChange: number | undefined) {
        super(PriceTickerEventType.PRICE_CHANGED);
        this.newPrice = newPrice;
        this.priceChange = priceChange;
    }
}
