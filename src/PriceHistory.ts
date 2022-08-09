import { Filled } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { ChainInternal, fetchBlockTimestamp } from './Chain';
import { GenericEventListener } from './event-types';
import { EventTargetX } from './EventTargetX';
import { checkAbortSignal, isAbortReason } from './utils';
import { fetchOrderbook, OrderbookInternal } from './Orderbook';
import { Cache } from './Cache';
import { ContractEvent, getBlockNumber } from '@theorderbookdex/abi2ts-lib';
import { ChainEvents } from './ChainEvents';
import { Address } from './Address';

export enum PriceHistoryEventType {
    /**
     * Event type dispatched when a history bar is updated.
     */
    HISTORY_BAR_UPDATED = 'historyBarUpdated',

    /**
     * Event type dispatched when a history bar is added.
     */
    HISTORY_BAR_ADDED = 'historyBarAdded',
}

/**
 * Price history time frame
 */
export enum TimeFrame {
    /**
     * 15 minutes time frame.
     */
    MINUTES_15 = 900,

    /**
     * 1 hour time frame.
     */
    HOUR = 3600,

    /**
     * 4 hour time frame.
     */
    HOUR_4 = 14400,

    /**
     * 1 day time frame.
     */
    DAY = 86400,

    /**
     * 1 week time frame.
     */
    WEEK = 604800,
}

/**
 * The price history.
 */
export abstract class PriceHistory extends EventTargetX {
    addEventListener(type: PriceHistoryEventType.HISTORY_BAR_UPDATED, callback: GenericEventListener<HistoryBarUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: PriceHistoryEventType.HISTORY_BAR_ADDED, callback: GenericEventListener<HistoryBarAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: PriceHistoryEventType, callback: GenericEventListener<PriceHistoryEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: PriceHistoryEventType.HISTORY_BAR_UPDATED, callback: GenericEventListener<HistoryBarUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: PriceHistoryEventType.HISTORY_BAR_ADDED, callback: GenericEventListener<HistoryBarAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: PriceHistoryEventType, callback: GenericEventListener<PriceHistoryEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    abstract [Symbol.asyncIterator](): AsyncIterator<PriceHistoryBar>;

    protected constructor() {
        super();
    }
}

export class PriceHistoryInternal extends PriceHistory {
    constructor(
        private readonly _orderbook: Address,
        private readonly _timeFrame: number,
        private readonly _abortSignal?: AbortSignal
    ) {
        super();
    }

    [Symbol.asyncIterator](): AsyncIterator<PriceHistoryBar> {
        return fetchAllPriceHistoryBars(this._orderbook, this._timeFrame, this._abortSignal);
    }

    private _updaterAbortController?: AbortController;
    private _waitForListener?: (() => Promise<void>);
    private _currentBar: PriceHistoryBar | undefined;

    protected _activateUpdater() {
        this._updaterAbortController = new AbortController();
        const abortSignal = this._updaterAbortController.signal;
        void (async () => {
            try {
                const sinceBlock = await getBlockNumber();
                this._currentBar = await fetchPriceHistoryBarAtBlock(this._orderbook, this._timeFrame, sinceBlock, abortSignal);
                const fromBlock = sinceBlock + 1;
                const toBlock = ChainEvents.instance.latestBlockNumber;
                const pendingTicks: PriceHistoryTickInternal[] = [];
                let onTick: (tick: PriceHistoryTickInternal) => void;
                onTick = tick => pendingTicks.push(tick);
                this._waitForListener = listenToPriceHistoryTicks(this._orderbook, abortSignal, tick => onTick(tick));
                if (fromBlock <= toBlock) {
                    for (const tick of await fetchPriceHistoryTicks(this._orderbook, fromBlock, toBlock, abortSignal)) {
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
        delete this._updaterAbortController;
        delete this._waitForListener;
    }

    private _update({ price, timestamp }: PriceHistoryTickInternal) {
        const barTimestamp = timestamp - timestamp % (this._timeFrame as number);
        if (this._currentBar?.timestamp == barTimestamp) {
            this._currentBar = {
                timestamp: this._currentBar.timestamp,
                open: this._currentBar.open,
                high: price > this._currentBar.high ? price : this._currentBar.high,
                low: price < this._currentBar.low ? price : this._currentBar.low,
                close: price
            };
            this.dispatchEvent(new HistoryBarUpdatedEvent(this._currentBar));
        } else {
            this._currentBar = {
                timestamp: barTimestamp,
                open: price,
                high: price,
                low: price,
                close: price
            };
            this.dispatchEvent(new HistoryBarAddedEvent(this._currentBar));
        }
    }

    public async _waitForUpdater() {
        if (this._waitForListener) await this._waitForListener();
    }
}

/**
 * A bar in the price history.
 */
export interface PriceHistoryBar {
    /**
     * The timestamp.
     */
    timestamp: number;

    /**
     * The open price.
     */
    open: bigint;

    /**
     * The close price.
     */
    close: bigint;

    /**
     * The lowest price.
     */
    low: bigint;

    /**
     * The highest price.
     */
    high: bigint;
}

export interface PriceHistoryTickInternal {
    readonly orderbook: string;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly price: bigint;
}

let filledEventFetcher = function(address: string, fromBlock: number, toBlock: number) {
    return Filled.get({ address, fromBlock, toBlock });
}

export async function captureFilledEventFetched(callback: () => Promise<void>) {
    const captured: Parameters<typeof filledEventFetcher>[] = [];
    const prevFilledEventFetcher = filledEventFetcher;
    filledEventFetcher = function(...params: Parameters<typeof filledEventFetcher>) {
        captured.push(params);
        return prevFilledEventFetcher(...params);
    }
    await callback();
    filledEventFetcher = prevFilledEventFetcher;
    return captured;
}

async function addPriceHistoryTicksToCache(orderbook: Address, fromBlock: number, toBlock: number, abortSignal?: AbortSignal) {
    checkAbortSignal(abortSignal);
    for await (const { price, blockNumber, logIndex } of filledEventFetcher(orderbook, fromBlock, toBlock)) {
        const timestamp = await fetchBlockTimestamp(blockNumber, abortSignal);
        await Cache.instance.savePriceHistoryTick({ orderbook, blockNumber, logIndex, price, timestamp }, abortSignal);
    }
    await Cache.instance.addPriceHistoryRange(orderbook, fromBlock, toBlock, abortSignal);
}

async function addMissingPriceHistoryTicksToCache(orderbook: Address, fromBlock: number, toBlock: number, abortSignal?: AbortSignal) {
    checkAbortSignal(abortSignal);
    for (const range of await Cache.instance.getPriceHistoryRanges(orderbook, fromBlock, toBlock, abortSignal)) {
        if (fromBlock < range.fromBlock) {
            await addPriceHistoryTicksToCache(orderbook, fromBlock, range.fromBlock - 1, abortSignal);
        }
        fromBlock = range.toBlock + 1;
    }
    if (fromBlock < toBlock) {
        await addPriceHistoryTicksToCache(orderbook, fromBlock, toBlock, abortSignal);
    }
}

export async function fetchPriceHistoryTicks(orderbook: Address, fromBlock: number, toBlock: number, abortSignal?: AbortSignal) {
    await addMissingPriceHistoryTicksToCache(orderbook, fromBlock, toBlock, abortSignal);
    return await Cache.instance.getPriceHistoryTicks(orderbook, fromBlock, toBlock, abortSignal);
}

export function listenToPriceHistoryTicks(orderbook: Address, abortSignal: AbortSignal, listener: (tick: PriceHistoryTickInternal) => void) {
    let fromBlock = ChainEvents.instance.latestBlockNumber + 1;
    let lastUpdate: Promise<void> = Promise.resolve();
    function eventListener(event: ContractEvent) {
        if (event instanceof Filled) {
            const { price, blockNumber, logIndex } = event;
            const prevUpdate = lastUpdate;
            lastUpdate = (async () => {
                try {
                    await prevUpdate;
                    checkAbortSignal(abortSignal);
                    if (blockNumber > fromBlock) {
                        await Cache.instance.addPriceHistoryRange(orderbook, fromBlock, blockNumber - 1, abortSignal);
                        fromBlock = blockNumber;
                    }
                    const timestamp = await fetchBlockTimestamp(blockNumber, abortSignal);
                    listener(await Cache.instance.savePriceHistoryTick({ orderbook, blockNumber, logIndex, price, timestamp }, abortSignal));
                } catch (error) {
                    if (!isAbortReason(abortSignal, error)) {
                        throw error;
                    }
                }
            })();
        }
    }
    ChainEvents.instance.on(orderbook, eventListener);
    abortSignal.addEventListener('abort', () => ChainEvents.instance.off(orderbook, eventListener), { once: true });
    return async function() {
        await lastUpdate;
    };
}

export async function fetchPriceHistoryBarAtBlock(orderbook: Address, timeFrame: number, toBlock: number, abortSignal?: AbortSignal) {
    const { creationBlockNumber } = await fetchOrderbook(orderbook) as OrderbookInternal;
    let blockTimestamp = await fetchBlockTimestamp(toBlock, abortSignal);
    const barTimestamp = blockTimestamp - blockTimestamp % timeFrame;
    let barTicks: PriceHistoryTickInternal[] = [];
    do {
        const fromBlock = Math.max(toBlock - ChainInternal.instance.MAX_GET_LOGS_BLOCKS + 1, creationBlockNumber);
        const ticks = await fetchPriceHistoryTicks(orderbook, fromBlock, toBlock, abortSignal);
        barTicks = [
            ...ticks.filter(tick => tick.timestamp - tick.timestamp % timeFrame == barTimestamp),
            ...barTicks,
        ];
        if (ticks.some(tick => tick.timestamp - tick.timestamp % timeFrame < barTimestamp)) break;
        toBlock = fromBlock - 1;
        if (toBlock < creationBlockNumber) break;
        blockTimestamp = await fetchBlockTimestamp(toBlock, abortSignal);
    } while (barTimestamp <= blockTimestamp);
    if (barTicks.length) {
        return {
            timestamp: barTimestamp,
            open: barTicks[0].price,
            high: barTicks.map(tick => tick.price).reduce((a, b) => a > b ? a : b),
            low: barTicks.map(tick => tick.price).reduce((a, b) => a < b ? a : b),
            close: barTicks[barTicks.length-1].price,
        };
    } else {
        return undefined;
    }
}

export async function* fetchAllPriceHistoryBars(orderbook: Address, timeFrame: number, abortSignal?: AbortSignal) {
    const { creationBlockNumber } = await fetchOrderbook(orderbook) as OrderbookInternal;
    let pendingBar: PriceHistoryBar | undefined;
    let toBlock = await getBlockNumber();
    while (toBlock >= creationBlockNumber) {
        const fromBlock = Math.max(toBlock - ChainInternal.instance.MAX_GET_LOGS_BLOCKS + 1, creationBlockNumber);
        const bars: Map<number, PriceHistoryBar> = new Map;
        for (const { price, timestamp } of await fetchPriceHistoryTicks(orderbook, fromBlock, toBlock, abortSignal)) {
            const barTimestamp = timestamp - timestamp % timeFrame;
            const bar = bars.get(barTimestamp);
            if (bar) {
                if (price > bar.high) bar.high = price;
                if (price < bar.low) bar.low = price;
                bar.close = price;
            } else {
                bars.set(barTimestamp, {
                    timestamp: barTimestamp,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                });
            }
        }
        if (pendingBar) {
            const bar = bars.get(pendingBar.timestamp);
            if (bar) {
                if (pendingBar.high > bar.high) bar.high = pendingBar.high;
                if (pendingBar.low < bar.low) bar.low = pendingBar.low;
                bar.close = pendingBar.close;
            } else {
                bars.set(pendingBar.timestamp, pendingBar);
            }
        }
        const barsArray = [...bars.values()].reverse();
        pendingBar = barsArray.pop();
        for (const bar of barsArray) {
            yield { ...bar };
        }
        if (pendingBar) {
            const fromBlockTimestamp = await fetchBlockTimestamp(fromBlock, abortSignal);
            if (fromBlockTimestamp - fromBlockTimestamp % timeFrame < pendingBar.timestamp) {
                yield { ...pendingBar };
                pendingBar = undefined;
            }
        }
        toBlock = fromBlock - 1;
    }
    if (pendingBar) {
        yield { ...pendingBar };
    }
}

export async function* fetchLast24hsPriceHistoryTicks(orderbook: Address, toBlock: number, abortSignal?: AbortSignal) {
    const { creationBlockNumber } = await fetchOrderbook(orderbook) as OrderbookInternal;
    const now = await fetchBlockTimestamp(toBlock, abortSignal);
    const aDayAgo = now - (TimeFrame.DAY as number);
    while (toBlock >= creationBlockNumber) {
        const fromBlock = Math.max(toBlock - ChainInternal.instance.MAX_GET_LOGS_BLOCKS + 1, creationBlockNumber);
        for (const tick of (await fetchPriceHistoryTicks(orderbook, fromBlock, toBlock, abortSignal)).reverse()) {
            yield tick;
            if (tick.timestamp <= aDayAgo) {
                return;
            }
        }
        toBlock = fromBlock - 1;
    }
}

/**
 * Event dispatched from PriceHistory.
 */
export abstract class PriceHistoryEvent extends Event {
    constructor(type: PriceHistoryEventType) {
        super(type);
    }
}

/**
 * Event dispatched when a history bar is added.
 */
export class HistoryBarAddedEvent extends PriceHistoryEvent {
    /**
     * The new bar.
     */
    readonly bar: PriceHistoryBar;

    /** @internal */
    constructor(bar: PriceHistoryBar) {
        super(PriceHistoryEventType.HISTORY_BAR_ADDED);
        this.bar = bar;
    }
}

/**
 * Event dispatched when a history bar is added.
 */
export class HistoryBarUpdatedEvent extends PriceHistoryEvent {
    /**
     * The updated bar.
     */
    readonly bar: PriceHistoryBar;

    /** @internal */
    constructor(bar: PriceHistoryBar) {
        super(PriceHistoryEventType.HISTORY_BAR_UPDATED);
        this.bar = bar;
    }
}
