import { IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { IOrderbookFactoryV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookFactoryV1';
import { IOrderbook } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbook';
import { Address } from './Address';
import { Cache } from './Cache';
import { OrderbookDEXInternal } from './OrderbookDEX';
import { fetchToken, Token } from './Token';
import { asyncCatchError, checkAbortSignal } from './utils';
import { PriceHistory, PriceHistoryInternal, TimeFrame } from './PriceHistory';
import { PricePoints, PricePointsInternal } from './PricePoints';
import { PriceTicker, PriceTickerInternal } from './PriceTicker';

/**
 * An orderbook.
 */
export abstract class Orderbook {
    /**
     * Version 1.
     */
    static get V1(): bigint {
        return 10000n;
    }

    /**
     * The address of the orderbook.
     */
    abstract get address(): Address;

    /**
     * The version of the orderbook.
     */
    abstract get version(): bigint;

    /**
     * The traded token.
     */
    abstract get tradedToken(): Token;

    /**
     * The base token.
     */
    abstract get baseToken(): Token;

    /**
     * The size of a contract in traded token.
     */
    abstract get contractSize(): bigint;

    /**
     * The price tick in base token.
     */
    abstract get priceTick(): bigint;

    /**
     * Get the price points.
     *
     * @param limit The amount of price points to show at most for each list.
     * @param abortSignal A signal to abort the operation.
     * @return The price points.
     */
    abstract getPricePoints(limit: number, abortSignal?: AbortSignal): Promise<PricePoints>;

    /**
     * Get the price history.
     *
     * History will be returned from newest to oldest.
     *
     * @param timeFrame The timeframe in milliseconds.
     * @param abortSignal A signal to abort the operation.
     * @return The price history.
     */
    abstract getPriceHistory(timeFrame: TimeFrame, abortSignal?: AbortSignal): PriceHistory;

    /**
     * Get the price ticker.
     *
     * @param abortSignal A signal to abort the operation.
     * @return The price ticker.
     */
    abstract getPriceTicker(abortSignal?: AbortSignal): Promise<PriceTicker>;
}

export class OrderbookInternal extends Orderbook {
    public readonly address: Address;
    public readonly version: bigint;
    public readonly tradedToken: Token;
    public readonly baseToken: Token;
    public readonly contractSize: bigint;
    public readonly priceTick: bigint;
    public readonly creationBlockNumber: number;

    async getPricePoints(limit: number, abortSignal?: AbortSignal) {
        return await PricePointsInternal.create(this.address, limit, abortSignal);
    }

    getPriceHistory(timeFrame: TimeFrame, abortSignal?: AbortSignal) {
        return new PriceHistoryInternal(this.address, timeFrame as number, abortSignal);
    }

    getPriceTicker(abortSignal?: AbortSignal) {
        return PriceTickerInternal.create(this.address, abortSignal);
    }

    constructor(properties: OrderbookProperties) {
        super();
        this.address             = properties.address;
        this.version             = properties.version;
        this.tradedToken         = properties.tradedToken;
        this.baseToken           = properties.baseToken;
        this.contractSize        = properties.contractSize;
        this.priceTick           = properties.priceTick;
        this.creationBlockNumber = properties.creationBlockNumber;
    }
}

interface OrderbookProperties {
    readonly address: Address;
    readonly version: bigint;
    readonly tradedToken: Token;
    readonly baseToken: Token;
    readonly contractSize: bigint;
    readonly priceTick: bigint;
    readonly creationBlockNumber: number;
}

export async function fetchOrderbook(address: Address, abortSignal?: AbortSignal): Promise<Orderbook> {
    checkAbortSignal(abortSignal);
    try {
        return await Cache.instance.getOrderbook(address, abortSignal);
    } catch {
        const contract = IOrderbook.at(address);
        const version = await asyncCatchError(contract.version(), NotAnOrderbook);
        checkAbortSignal(abortSignal);
        switch (version) {
            case Orderbook.V1: {
                const contract = IOrderbookV1.at(address);
                const tradedToken = await fetchToken(await asyncCatchError(contract.tradedToken(), NotAnOrderbook) as Address, abortSignal);
                checkAbortSignal(abortSignal);
                const baseToken = await fetchToken(await asyncCatchError(contract.baseToken(), NotAnOrderbook) as Address, abortSignal);
                checkAbortSignal(abortSignal);
                const contractSize = await asyncCatchError(contract.contractSize(), NotAnOrderbook);
                checkAbortSignal(abortSignal);
                const priceTick = await asyncCatchError(contract.priceTick(), NotAnOrderbook);
                checkAbortSignal(abortSignal);
                const orderbookFactory = IOrderbookFactoryV1.at(OrderbookDEXInternal.instance._config.orderbookFactoryV1);
                const creationBlockNumber = Number(await asyncCatchError(orderbookFactory.blockNumber(address), NotAnOrderbook));
                checkAbortSignal(abortSignal);
                return await Cache.instance.saveOrderbook(new OrderbookInternal({
                    address, version, tradedToken, baseToken, contractSize, priceTick, creationBlockNumber
                }), abortSignal);
            }
            default: {
                throw new UnsupportedOrderbookVersion;
            }
        }
    }
}

/**
 * Error thrown when a given address fails to conform to the orderbook interface.
 */
export class NotAnOrderbook extends Error {
    /** @internal */
    constructor() {
        super('Not An Orderbook');
        this.name = 'NotAnOrderbook';
    }
}

/**
 * Error thrown when trying to use an orderbook version not supported by the api.
 */
export class UnsupportedOrderbookVersion extends Error {
    /** @internal */
    constructor() {
        super('Unsupported Orderbook Version');
        this.name = 'UnsupportedOrderbookVersion';
    }
}

/**
 * Format the orderbook version into a human readable string.
 *
 * @param version the orderbook version
 * @returns the formatted orderbook version
 */
export function formatVersion(version: bigint) {
    const patchVersion = version % 100n;
    const minorVersion = (version / 100n) % 100n;
    const majorVersion = version / 10000n;
    return `V${majorVersion}${minorVersion||patchVersion?`.${minorVersion}${patchVersion?`.${patchVersion}`:''}`:''}`;
}
