import { formatValue } from '@frugal-wizard/abi2ts-lib';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { Address } from './Address';
import { Chain } from './Chain';
import { Database, NotInDatabase, TrackedFlag } from './Database';
import { GenericEventListener } from './event-types';
import { fetchFee, fetchOrderbookData, fetchOrderbooksData, Orderbook, OrderbookInternal } from './Orderbook';
import { NotAnERC20Token, Token } from './Token';
import { asyncCatchError } from './utils';

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
     * Format a fee as a percentage.
     *
     * @param fee The fee to format.
     * @returns The formatted value.
     */
    formatFeeAsPercentage(fee: bigint): string {
        return `${formatValue(fee, 16)}%`;
    }

    /**
     * Apply a fee to an amount.
     *
     * @param amount The amount to parse.
     * @param fee The fee to apply.
     * @returns The amount taken as fee.
     */
    applyFee(amount: bigint, fee: bigint): bigint {
        return amount * fee / (10n ** 18n);
    }

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
                const contract = IERC20.at(address);
                const name = await asyncCatchError(contract.name({ abortSignal }), NotAnERC20Token);
                const symbol = await asyncCatchError(contract.symbol({ abortSignal }), NotAnERC20Token);
                const decimals = await asyncCatchError(contract.decimals({ abortSignal }), NotAnERC20Token);
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
            const tracked = orderbook.tracked == TrackedFlag.TRACKED;
            const tradedToken = await this.getToken(orderbook.tradedToken, abortSignal);
            if (!tradedToken.tracked) continue;
            const baseToken = await this.getToken(orderbook.baseToken, abortSignal);
            if (!tradedToken.tracked) continue;
            const fee = await fetchFee(orderbook.version, abortSignal);
            yield new OrderbookInternal({ ...orderbook, tracked, tradedToken, baseToken, fee });
        }
    }

    async getOrderbook(address: Address, abortSignal?: AbortSignal): Promise<OrderbookInternal> {
        const orderbook = await fetchOrderbookData(address, abortSignal);
        const tracked = orderbook.tracked == TrackedFlag.TRACKED;
        const tradedToken = await this.getToken(orderbook.tradedToken, abortSignal);
        const baseToken = await this.getToken(orderbook.baseToken, abortSignal);
        const fee = await fetchFee(orderbook.version, abortSignal);
        return new OrderbookInternal({ ...orderbook, tracked, tradedToken, baseToken, fee });
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
    readonly treasury: Address;
    readonly operatorFactory: Address;
    readonly operatorV1: Address;
    readonly orderbookFactoryV1: Address;
    readonly tokens: Address[];
    readonly tokensWithFaucet: Address[];
    readonly orderbooks: Address[];
}

export const orderbookDEXConfigs: { [chainId: number]: OrderbookDEXConfig | undefined } = {};

orderbookDEXConfigs[5] = {
    treasury:           '0x0000000000000000000000000000000000000000' as Address,
    operatorFactory:    '0x8D6d10630a8Cf88519a9C38AA4F486492Bee62D4' as Address,
    operatorV1:         '0x7baB64F1c9339CCd275209a7ad02cCb9099AF79f' as Address,
    orderbookFactoryV1: '0x4c05020310E4ffA64620Fd2D419227d4cd8824ac' as Address,
    tokens: [
        '0x7FFaFDFD84fdc7EBEbF055AbD32e075013351dac' as Address, // WBTC
        '0xC648b5cEa6bb4707dF69BDB54CdcD1120B164A14' as Address, // WETH
        '0xab305E379e22d520Aa7715B17F068975eC59F7A4' as Address, // BNB
        '0xf2996fAeee7E3760a50192631C56bda595D7CE15' as Address, // WXRP
        '0xF7717f2cd227B4Ac266eB10d3225783f0C8B94a2' as Address, // USDT
    ],
    tokensWithFaucet: [
        '0x7FFaFDFD84fdc7EBEbF055AbD32e075013351dac' as Address, // WBTC
        '0xC648b5cEa6bb4707dF69BDB54CdcD1120B164A14' as Address, // WETH
        '0xab305E379e22d520Aa7715B17F068975eC59F7A4' as Address, // BNB
        '0xf2996fAeee7E3760a50192631C56bda595D7CE15' as Address, // WXRP
        '0xF7717f2cd227B4Ac266eB10d3225783f0C8B94a2' as Address, // USDT
    ],
    orderbooks: [
        '0xe8202815Bc6467f250BEB709e38cbFb161bA5c0F' as Address, // WBTC/USDT
        '0xB7324bb1417A8959e4EEE291b4650223d52e479E' as Address, // WETH/USDT
        '0x24CB31C2Ba0459Ef60C146D0415AaDe687Ad037A' as Address, //  BNB/USDT
        '0x7bCF97AeA6ba4070de249F313F23b2aE17f7D205' as Address, // WXRP/USDT
    ],
};

export const devnetConfig = orderbookDEXConfigs[1337] = {
    treasury:           '0xF2E246BB76DF876Cef8b38ae84130F4F55De395b' as Address,
    operatorFactory:    '0xDe09E74d4888Bc4e65F589e8c13Bce9F71DdF4c7' as Address,
    operatorV1:         '0x51a240271AB8AB9f9a21C82d9a85396b704E164d' as Address,
    orderbookFactoryV1: '0xB9816fC57977D5A786E654c7CF76767be63b966e' as Address,
    tokens: [
        '0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1' as Address,
        '0x5CF7F96627F3C9903763d128A1cc5D97556A6b99' as Address,
        '0xA3183498b579bd228aa2B62101C40CC1da978F24' as Address,
        '0x63f58053c9499E1104a6f6c6d2581d6D83067EEB' as Address,
        '0x66a15edcC3b50a663e72F1457FFd49b9AE284dDc' as Address,
    ],
    tokensWithFaucet: [
        '0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1' as Address,
        '0x5CF7F96627F3C9903763d128A1cc5D97556A6b99' as Address,
        '0xA3183498b579bd228aa2B62101C40CC1da978F24' as Address,
        '0x63f58053c9499E1104a6f6c6d2581d6D83067EEB' as Address,
        '0x66a15edcC3b50a663e72F1457FFd49b9AE284dDc' as Address,
    ],
    orderbooks: [
        '0xEbF7a4c0856859eE173FAc8Cc7eb0488950538fb' as Address,
        '0xE2873261f82fdC86FB9e45c277381d1314EF167C' as Address,
        '0x64F18F65dB29D1eF902Ec0D1671bFd6dA3285C38' as Address,
        '0x825F774215B9AadEDF23B48F25De5384973cd7da' as Address,
    ],
};
