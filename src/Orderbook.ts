import { IOrderbookDEXTeamTreasury } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbookDEXTeamTreasury';
import { IOrderbookFactoryV1, OrderbookCreated } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookFactoryV1';
import { IOrderbook } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbook';
import { Address, ZERO_ADDRESS } from './Address';
import { Database, OrderbookData, TrackedFlag } from './Database';
import { OrderbookDEXInternal } from './OrderbookDEX';
import { Token } from './Token';
import { asyncCatchError, asyncFirst } from './utils';
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
     * Whether the orderbook is being tracked.
     */
    abstract get tracked(): boolean;

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
     * The block number the orderbook was created at.
     */
    abstract get creationBlockNumber(): number;

    /**
     * The fee applied in this orderbook.
     */
    abstract get fee(): bigint;

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
    public readonly tracked: boolean;
    public readonly address: Address;
    public readonly version: bigint;
    public readonly tradedToken: Token;
    public readonly baseToken: Token;
    public readonly contractSize: bigint;
    public readonly priceTick: bigint;
    public readonly creationBlockNumber: number;
    public readonly fee: bigint;

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
        this.tracked             = properties.tracked;
        this.address             = properties.address;
        this.version             = properties.version;
        this.tradedToken         = properties.tradedToken;
        this.baseToken           = properties.baseToken;
        this.contractSize        = properties.contractSize;
        this.priceTick           = properties.priceTick;
        this.creationBlockNumber = properties.creationBlockNumber;
        this.fee                 = properties.fee;
    }
}

interface OrderbookProperties {
    readonly tracked: boolean;
    readonly address: Address;
    readonly version: bigint;
    readonly tradedToken: Token;
    readonly baseToken: Token;
    readonly contractSize: bigint;
    readonly priceTick: bigint;
    readonly creationBlockNumber: number;
    readonly fee: bigint;
}

// TODO listen to fee updates and store current fee in database

const feeCache = new Map<bigint, bigint>();

export async function fetchFee(version: bigint, abortSignal?: AbortSignal): Promise<bigint> {
    try {
        const cachedFee = feeCache.get(version);
        if (cachedFee !== undefined) return cachedFee;

        const { treasury } = OrderbookDEXInternal.instance._config;
        const fee = await IOrderbookDEXTeamTreasury.at(treasury).fee(version);
        feeCache.set(version, fee);
        return fee;

    } finally {
        // eslint-disable-next-line no-unsafe-finally
        if (abortSignal?.aborted) throw abortSignal.reason;
    }
}

const FETCH_ORDERBOOKS_BATCH = 10n;

export async function* fetchOrderbooksData(abortSignal?: AbortSignal) {
    const { orderbookFactoryV1 } = OrderbookDEXInternal.instance._config;
    let index = 0;
    for await (const orderbook of Database.instance.getOrderbooks(orderbookFactoryV1, abortSignal)) {
        index = orderbook.factoryIndex as number + 1;
        yield orderbook;
    }
    const orderbookFactory = IOrderbookFactoryV1.at(orderbookFactoryV1);
    const totalCreated = Number(await orderbookFactory.totalCreated({ abortSignal }));
    while (index < totalCreated) {
        for (const address of await orderbookFactory.orderbooks(BigInt(index), FETCH_ORDERBOOKS_BATCH, { abortSignal })) {
            if (address == ZERO_ADDRESS) break;
            const orderbook: OrderbookData = {
                ...await fetchOrderbookData(address as Address, abortSignal),
                factory: orderbookFactoryV1,
                factoryIndex: index,
            };
            await Database.instance.saveOrderbook(orderbook, abortSignal);
            yield orderbook;
            index++;
        }
    }
}

export async function fetchOrderbookData(address: Address, abortSignal?: AbortSignal): Promise<OrderbookData> {
    try {
        return await Database.instance.getOrderbook(address, abortSignal);
    } catch {
        const contract = IOrderbook.at(address);
        const version = await asyncCatchError(contract.version({ abortSignal }), NotAnOrderbook);
        switch (version) {
            case Orderbook.V1: {
                const orderbookFactory = IOrderbookFactoryV1.at(OrderbookDEXInternal.instance._config.orderbookFactoryV1);
                const event = await asyncFirst(OrderbookCreated.get({ address: orderbookFactory.address, orderbook: address }, abortSignal));
                if (!event) throw new NotAnOrderbook();
                const { tradedToken, baseToken, contractSize, priceTick, blockNumber: creationBlockNumber } = event;
                const orderbook = {
                    tracked: TrackedFlag.NOT_TRACKED,
                    address,
                    version,
                    tradedToken: tradedToken as Address,
                    baseToken: baseToken as Address,
                    contractSize,
                    priceTick,
                    creationBlockNumber,
                };
                await Database.instance.saveOrderbook(orderbook, abortSignal);
                return orderbook;
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
    constructor() {
        super('Not An Orderbook');
        this.name = 'NotAnOrderbook';
    }
}

/**
 * Error thrown when trying to use an orderbook version not supported by the api.
 */
export class UnsupportedOrderbookVersion extends Error {
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
