import { Address } from './Address';
import { Chain } from './Chain';
import { GenericEventListener } from './event-types';
import { fetchOrderbook, Orderbook } from './Orderbook';
import { fetchToken, Token } from './Token';

export enum OrderbookDEXEventType {
    /**
     * Event type dispatched when an orderbook has been added to the list of orderbooks.
     */
    ORDERBOOK_ADDED = 'orderbookAdded',
}

/**
 * Connection to The Orderbook DEX.
 */
export abstract class OrderbookDEX extends EventTarget {
    /**
     * Connect to The Orderbook DEX.
     *
     * @returns The Orderbook DEX.
     * @throws {ChainNotConnected} When connection to the blockchain has not been
     *                             established.
     * @throws {ChainNotSupported} When trying to use The Orderbook DEX in an unsupported
     *                             chain.
     */
    static async connect(): Promise<OrderbookDEX> {
        return await OrderbookDEXInternal.connect();
    }

    /**
     * The connection to The Orderbook DEX.
     */
    static get instance(): OrderbookDEX {
        return OrderbookDEXInternal.instance;
    }

    /**
     * Disconnect from The Orderbook DEX.
     */
    static disconnect(): void {
        OrderbookDEXInternal.disconnect();
    }

    /**
     * Get an ERC20 token.
     *
     * @param address the address of the token
     * @param abortSignal A signal to abort the operation.
     * @return the token
     * @throws {NotAnERC20Token} When the given address fails to conform to the
     *                           ERC20 token standard.
     */
    abstract getToken(address: Address, abortSignal?: AbortSignal): Promise<Token>;

    /**
     * Get all the orderbooks.
     *
     * Actually, not all orderbooks are returned, just those that match the user's
     * tracked tokens.
     *
     * This is temporary until we figure out a better way to handle the search
     * feature in the UI.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The orderbooks.
     */
    abstract getOrderbooks(abortSignal?: AbortSignal): AsyncIterable<Orderbook>;

    addEventListener(type: OrderbookDEXEventType.ORDERBOOK_ADDED, callback: GenericEventListener<OrderbookAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OrderbookDEXEventType, callback: GenericEventListener<OrderbookDEXEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: OrderbookDEXEventType.ORDERBOOK_ADDED, callback: GenericEventListener<OrderbookAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OrderbookDEXEventType, callback: GenericEventListener<OrderbookDEXEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    /** @internal */
    dispatchEvent(event: OrderbookDEXEvent): boolean {
        return super.dispatchEvent(event);
    }

    protected constructor() {
        super();
    }
}

export class OrderbookDEXInternal extends OrderbookDEX {
    private static _instance?: OrderbookDEXInternal;

    static async connect(): Promise<OrderbookDEXInternal> {
        if (!this._instance) {
            const config = orderbookDEXChainConfigs[Chain.instance.chainId];
            if (!config) {
                throw new ChainNotSupported();
            }
            this._instance = new OrderbookDEXInternal(config);
        }
        return this._instance;
    }

    static get instance(): OrderbookDEXInternal {
        if (!this._instance) {
            throw new OrderbookDEXNotConnected();
        }
        return this._instance;
    }

    static disconnect() {
        delete this._instance;
    }

    constructor(public readonly _config: OrderbookDEXChainConfig) {
        super();
    }

    async getToken(address: Address, abortSignal?: AbortSignal): Promise<Token> {
        return await fetchToken(address, abortSignal);
    }

    async * getOrderbooks(abortSignal?: AbortSignal): AsyncIterable<Orderbook> {
        // TODO hardcoded
        for (const address of this._config.orderbooks) {
            yield await fetchOrderbook(address, abortSignal);
        }
    }
}

/**
 * Event dispatched from OrderbookDEX.
 */
export abstract class OrderbookDEXEvent extends Event {
    constructor(type: OrderbookDEXEventType) {
        super(type);
    }
}

/**
 * Event dispatched when an orderbook is added.
 */
export class OrderbookAddedEvent extends OrderbookDEXEvent {
    /** @internal */
    constructor(readonly orderbook: Orderbook) {
        super(OrderbookDEXEventType.ORDERBOOK_ADDED);
    }
}

/**
 * Error thrown when trying to access The Orderbook DEX singleton instance before it is
 * connected.
 */
export class OrderbookDEXNotConnected extends Error {
    /** @internal */
    constructor() {
        super('OrderbookDEX Not Connected');
        this.name = 'OrderbookDEXNotConnected';
    }
}

/**
 * Error thrown when trying to use The Orderbook DEX in an unsupported chain.
 */
export class ChainNotSupported extends Error {
    /** @internal */
    constructor() {
        super('Chain Not Supported');
        this.name = 'ChainNotSupported';
    }
}

interface OrderbookDEXChainConfig {
    readonly operatorFactory: Address;
    readonly orderbookFactoryV1: Address;
    readonly orderbooks: Address[];
}

export const orderbookDEXChainConfigs: { [chainId: number]: OrderbookDEXChainConfig | undefined } = {};

orderbookDEXChainConfigs[5] = {
    operatorFactory: '0x7BF5889661f06B7d287C6acBA754d318F17E4A52' as Address,
    orderbookFactoryV1: '0xdFbd8e2360B96C0bd4A00d4D1271A33f0C6E75C7' as Address,
    orderbooks: [
        '0x24C2d6AA89b3DCC86a4d75cc85727136C5d5872f' as Address, // WBTC/USDC
        '0xe705DB4Ae1d5E82f14e08B865448ab14498D36fD' as Address, // WETH/USDC
    ],
};

orderbookDEXChainConfigs[1337] = {
    operatorFactory: '0x2946259E0334f33A064106302415aD3391BeD384' as Address,
    orderbookFactoryV1: '0x51a240271AB8AB9f9a21C82d9a85396b704E164d' as Address,
    orderbooks: [
        '0x3E920B0890189806A99451699e4e531E81035BA6' as Address,
        '0x119F7448b228415C974f5814462Ec5a87837678f' as Address,
        '0xB880b3FB12a48815fD79E30394a8F336159d3188' as Address,
        '0xD86519C020EfC929eb2D0B967499267f287493c7' as Address,
    ],
};
