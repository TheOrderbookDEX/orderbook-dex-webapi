import { IOrderbookFactoryV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookFactoryV1';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { OrderbookCreated } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbookFactory';
import { Address } from './Address';
import { Chain } from './Chain';
import { Database, NotInDatabase, TrackedFlag } from './Database';
import { GenericEventListener } from './event-types';
import { fetchOrderbookData, fetchOrderbooksData, Orderbook, OrderbookInternal } from './Orderbook';
import { NotAnERC20Token, Token } from './Token';
import { asyncCatchError, createAbortifier } from './utils';

export enum OrderbookDEXEventType {
    /**
     * Event type dispatched when a token has been added to the list of tracked tokens.
     */
    TOKEN_ADDED = 'tokenAdded',

    /**
     * Event type dispatched when a token has been removed from the list of tracked tokens.
     */
    TOKEN_REMOVED = 'tokenRemoved',
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
     * Get the tokens that the user is tracking.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The tokens that the user is tracking.
     */
    abstract getTokens(abortSignal?: AbortSignal): AsyncIterable<Token>;

    /**
     * Start tracking a token.
     *
     * @param token The token to track.
     * @param abortSignal A signal to abort the operation.
     */
    abstract trackToken(token: Token, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Stop tracking a token.
     *
     * @param token The token to forget.
     * @param abortSignal A signal to abort the operation.
     */
    abstract forgetToken(token: Token, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Get the orderbooks.
     *
     * Orderbooks that don't match the user's tracked tokens are not returned.
     *
     * @param filter A filter that orderbooks returned must match.
     * @param abortSignal A signal to abort the operation.
     * @returns The orderbooks.
     */
    abstract getOrderbooks(filter: OrderbookFilter, abortSignal?: AbortSignal): AsyncIterable<Orderbook>;

    /**
     * Get an orderbook.
     *
     * @param address the address of the orderbook
     * @param abortSignal A signal to abort the operation.
     * @return the orderbook
     * @throws {NotAnOrderbook} When the given address fails to conform to the orderbook interface.
     */
    abstract getOrderbook(address: Address, abortSignal?: AbortSignal): Promise<Orderbook>;

    /**
     * Start tracking an orderbook.
     *
     * @param orderbook The orderbook to track.
     * @param abortSignal A signal to abort the operation.
     */
    abstract trackOrderbook(orderbook: Orderbook, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Stop tracking an orderbook.
     *
     * @param orderbook The orderbook to forget.
     * @param abortSignal A signal to abort the operation.
     */
    abstract forgetOrderbook(orderbook: Orderbook, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Create a new orderbook.
     *
     * @param properties The properties of the new orderbook.
     */
    abstract createOrderbook(properties: OrderbookProperties): Promise<Orderbook>;

    addEventListener(type: OrderbookDEXEventType.TOKEN_ADDED, callback: GenericEventListener<TokenAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OrderbookDEXEventType.TOKEN_REMOVED, callback: GenericEventListener<TokenRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OrderbookDEXEventType, callback: GenericEventListener<OrderbookDEXEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: OrderbookDEXEventType.TOKEN_ADDED, callback: GenericEventListener<TokenAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OrderbookDEXEventType.TOKEN_REMOVED, callback: GenericEventListener<TokenRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
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

/**
 * Filter which orderbooks are retrieved.
 */
export interface OrderbookFilter {
    /**
     * Whether to retrieve tracked orderbooks only.
     */
    tracked?: boolean;

    /**
     * Retrieve only orderbooks matching this traded token.
     */
    tradedToken?: Address;

    /**
     * Retrieve only orderbooks matching this base token.
     */
    baseToken?: Address;
}

export interface OrderbookProperties {
    /**
     * The traded token.
     */
    readonly tradedToken: Token;

    /**
     * The base token.
     */
    readonly baseToken: Token;

    /**
     * The size of a contract in traded token.
     */
    readonly contractSize: bigint;

    /**
     * The price tick in base token.
     */
    readonly priceTick: bigint;
}

export class OrderbookDEXInternal extends OrderbookDEX {
    private static _instance?: OrderbookDEXInternal;

    static async connect(): Promise<OrderbookDEXInternal> {
        if (!this._instance) {
            const config = orderbookDEXConfigs[Chain.instance.chainId];
            if (!config) {
                throw new ChainNotSupported();
            }
            this._instance = new OrderbookDEXInternal(config);
            await this._instance.initialize();
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

    constructor(public readonly _config: OrderbookDEXConfig) {
        super();
    }

    async initialize(abortSignal?: AbortSignal): Promise<void> {
        if (!await Database.instance.getSetting('initialized', abortSignal)) {
            for (const address of this._config.tokens) {
                const token = await this.getToken(address, abortSignal);
                await this.trackToken(token, abortSignal);
            }
            for (const address of this._config.orderbooks) {
                const orderbook = await this.getOrderbook(address, abortSignal);
                await this.trackOrderbook(orderbook, abortSignal);
            }
            await Database.instance.setSetting('initialized', true, abortSignal);
        }
    }

    async getToken(address: Address, abortSignal?: AbortSignal): Promise<Token> {
        const hasFaucet = this._config.tokensWithFaucet.includes(address);
        try {
            const token = await Database.instance.getToken(address, abortSignal);
            const tracked = token.tracked == TrackedFlag.TRACKED;
            return new Token({ ...token, tracked, hasFaucet });

        } catch (error) {
            if (error instanceof NotInDatabase) {
                const abortify = createAbortifier(abortSignal);
                const contract = IERC20.at(address);
                const name = await abortify(asyncCatchError(contract.name(), NotAnERC20Token));
                const symbol = await abortify(asyncCatchError(contract.symbol(), NotAnERC20Token));
                const decimals = await abortify(asyncCatchError(contract.decimals(), NotAnERC20Token));
                await Database.instance.saveToken({ tracked: TrackedFlag.NOT_TRACKED, address, name, symbol, decimals }, abortSignal);
                return new Token({ tracked: false, address, name, symbol, decimals, hasFaucet });

            } else {
                throw error;
            }
        }
    }

    async * getTokens(abortSignal?: AbortSignal): AsyncIterable<Token> {
        for await (const token of Database.instance.getTrackedTokens(abortSignal)) {
            const tracked = token.tracked == TrackedFlag.TRACKED;
            const hasFaucet = this._config.tokensWithFaucet.includes(token.address);
            yield new Token({ ...token, tracked, hasFaucet });
        }
    }

    async trackToken(token: Token, abortSignal?: AbortSignal): Promise<void> {
        await Database.instance.saveToken({ ...token, tracked: TrackedFlag.TRACKED }, abortSignal);
        this.dispatchEvent(new TokenAddedEvent(token));
    }

    async forgetToken(token: Token, abortSignal?: AbortSignal): Promise<void> {
        await Database.instance.saveToken({ ...token, tracked: TrackedFlag.NOT_TRACKED }, abortSignal);
        this.dispatchEvent(new TokenAddedEvent(token));
    }

    async * getOrderbooks(filter: OrderbookFilter, abortSignal?: AbortSignal): AsyncIterable<OrderbookInternal> {
        for await (const orderbook of fetchOrderbooksData(abortSignal)) {
            if (filter.tracked && orderbook.tracked != TrackedFlag.TRACKED) continue;
            if (filter.tradedToken && filter.tradedToken != orderbook.tradedToken) continue;
            if (filter.baseToken && filter.baseToken != orderbook.baseToken) continue;
            const tradedToken = await this.getToken(orderbook.tradedToken, abortSignal);
            if (!tradedToken.tracked) continue;
            const baseToken = await this.getToken(orderbook.baseToken, abortSignal);
            if (!tradedToken.tracked) continue;
            yield new OrderbookInternal({ ...orderbook, tradedToken, baseToken });
        }
    }

    async getOrderbook(address: Address, abortSignal?: AbortSignal): Promise<OrderbookInternal> {
        const orderbook = await fetchOrderbookData(address, abortSignal);
        return new OrderbookInternal({
            ...orderbook,
            tradedToken: await this.getToken(orderbook.tradedToken, abortSignal),
            baseToken: await this.getToken(orderbook.baseToken, abortSignal),
        });
    }

    async trackOrderbook(orderbook: OrderbookInternal, abortSignal?: AbortSignal): Promise<void> {
        await Database.instance.saveOrderbook({
            ...orderbook,
            tradedToken: orderbook.tradedToken.address,
            baseToken: orderbook.baseToken.address,
            tracked: TrackedFlag.TRACKED,
        }, abortSignal);
    }

    async forgetOrderbook(orderbook: OrderbookInternal, abortSignal?: AbortSignal): Promise<void> {
        await Database.instance.saveOrderbook({
            ...orderbook,
            tradedToken: orderbook.tradedToken.address,
            baseToken: orderbook.baseToken.address,
            tracked: TrackedFlag.NOT_TRACKED,
        }, abortSignal);
    }

    async createOrderbook(properties: OrderbookProperties): Promise<Orderbook> {
        const { tradedToken, baseToken, contractSize, priceTick } = properties;
        const factory = IOrderbookFactoryV1.at(this._config.orderbookFactoryV1);
        const { events } = await factory.createOrderbook(tradedToken, baseToken, contractSize, priceTick);
        const [ { orderbook } ] = events.filter(event => event instanceof OrderbookCreated) as OrderbookCreated[];
        return await this.getOrderbook(orderbook as Address);
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
 * Event type dispatched when a token has been added to the list of tracked tokens.
 */
export class TokenAddedEvent extends OrderbookDEXEvent {
    /** @internal */
    constructor(readonly token: Token) {
        super(OrderbookDEXEventType.TOKEN_ADDED);
    }
}

/**
 * Event type dispatched when a token has been removed from the list of tracked tokens.
 */
export class TokenRemovedEvent extends OrderbookDEXEvent {
    /** @internal */
    constructor(readonly token: Token) {
        super(OrderbookDEXEventType.TOKEN_REMOVED);
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

interface OrderbookDEXConfig {
    readonly operatorFactory: Address;
    readonly operatorV1: Address;
    readonly orderbookFactoryV1: Address;
    readonly tokens: Address[];
    readonly tokensWithFaucet: Address[];
    readonly orderbooks: Address[];
}

export const orderbookDEXConfigs: { [chainId: number]: OrderbookDEXConfig | undefined } = {};

orderbookDEXConfigs[5] = {
    operatorFactory: '0x7BF5889661f06B7d287C6acBA754d318F17E4A52' as Address,
    operatorV1: '0x0000000000000000000000000000000000000000' as Address,
    orderbookFactoryV1: '0xdFbd8e2360B96C0bd4A00d4D1271A33f0C6E75C7' as Address,
    tokens: [
        '0xc04b0d3107736c32e19f1c62b2af67be61d63a05' as Address, // WBTC
        '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6' as Address, // WETH
        '0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c' as Address, // USDC
    ],
    tokensWithFaucet: [
    ],
    orderbooks: [
        '0x24C2d6AA89b3DCC86a4d75cc85727136C5d5872f' as Address, // WBTC/USDC
        '0xe705DB4Ae1d5E82f14e08B865448ab14498D36fD' as Address, // WETH/USDC
    ],
};

export const devnetConfig = orderbookDEXConfigs[1337] = {
    operatorFactory: '0x2946259E0334f33A064106302415aD3391BeD384' as Address,
    operatorV1: '0xDe09E74d4888Bc4e65F589e8c13Bce9F71DdF4c7' as Address,
    orderbookFactoryV1: '0x51a240271AB8AB9f9a21C82d9a85396b704E164d' as Address,
    tokens: [
        '0xB9816fC57977D5A786E654c7CF76767be63b966e' as Address,
        '0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1' as Address,
        '0x5CF7F96627F3C9903763d128A1cc5D97556A6b99' as Address,
        '0xA3183498b579bd228aa2B62101C40CC1da978F24' as Address,
        '0x63f58053c9499E1104a6f6c6d2581d6D83067EEB' as Address,
    ],
    tokensWithFaucet: [
        '0xB9816fC57977D5A786E654c7CF76767be63b966e' as Address,
        '0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1' as Address,
        '0x5CF7F96627F3C9903763d128A1cc5D97556A6b99' as Address,
        '0xA3183498b579bd228aa2B62101C40CC1da978F24' as Address,
        '0x63f58053c9499E1104a6f6c6d2581d6D83067EEB' as Address,
    ],
    orderbooks: [
        '0x3E920B0890189806A99451699e4e531E81035BA6' as Address,
        '0x119F7448b228415C974f5814462Ec5a87837678f' as Address,
        '0xB880b3FB12a48815fD79E30394a8F336159d3188' as Address,
        '0xD86519C020EfC929eb2D0B967499267f287493c7' as Address,
    ],
};
