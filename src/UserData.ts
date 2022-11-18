import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Address } from './Address';
import { Chain } from './Chain';
import { GenericEventListener } from './event-types';
import { fetchOrderbook, Orderbook } from './Orderbook';
import { fetchToken, Token } from './Token';
import { checkAbortSignal } from './utils';

// TODO move all UserData functionality to OrderbookDEX

export enum UserDataEventType {
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
 * The data of an user of The Orderbook DEX.
 */
export abstract class UserData extends EventTarget {
    /**
     * Load the user data.
     *
     * @throws {ChainNotConnected} When connection to the blockchain has not been
     *                             established.
     */
    static async load(): Promise<UserData> {
        return await UserDataInternal.load();
    }

    /**
     * The data of the user of The Orderbook DEX.
     *
     * @throws {UserDataNotLoaded} When user data has not been loaded.
     */
    static get instance(): UserData {
        return UserDataInternal.instance;
    }

    /**
     * Unload the user data.
     */
    static unload(): void {
        UserDataInternal.unload();
    }

    /**
     * Get the orderbooks that the user has saved.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The orderbooks that the user has saved.
     */
    abstract savedOrderbooks(abortSignal?: AbortSignal): AsyncIterable<Orderbook>;

    /**
     * Save an orderbook.
     *
     * @param orderbook The orderbook to save.
     * @param abortSignal A signal to abort the operation.
     */
    abstract saveOrderbook(orderbook: Orderbook, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Forget an orderbook.
     *
     * @param orderbook The orderbook to forget.
     * @param abortSignal A signal to abort the operation.
     */
    abstract forgetOrderbook(orderbook: Orderbook, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Get the tokens that the user is tracking.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The tokens that the user is tracking.
     */
    abstract trackedTokens(abortSignal?: AbortSignal): AsyncIterable<Token>;

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

    addEventListener(type: UserDataEventType.TOKEN_ADDED, callback: GenericEventListener<TokenAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: UserDataEventType.TOKEN_REMOVED, callback: GenericEventListener<TokenRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: UserDataEventType, callback: GenericEventListener<UserDataEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: UserDataEventType.TOKEN_ADDED, callback: GenericEventListener<TokenAddedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: UserDataEventType.TOKEN_REMOVED, callback: GenericEventListener<TokenRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: UserDataEventType, callback: GenericEventListener<UserDataEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    /** @internal */
    dispatchEvent(event: UserDataEvent): boolean {
        return super.dispatchEvent(event);
    }

    protected constructor() {
        super();
    }
}

export class UserDataInternal extends UserData {
    private static _instance?: UserDataInternal;

    static async load(): Promise<UserDataInternal> {
        if (!this._instance) {
            const chainId = Chain.instance.chainId;
            const db = await openDB<UserDataDBV1>(`UserData${chainId}`, 2, {
                async upgrade(db, oldVersion, newVersion: number) {
                    if (oldVersion < 2) {
                        const olddb = db as IDBPDatabase;
                        for (const name of olddb.objectStoreNames) {
                            olddb.deleteObjectStore(name);
                        }
                    }
                    if (newVersion >= 2) {
                        const trackedTokens = db.createObjectStore('trackedTokens', {
                            keyPath: 'address',
                        });
                        const savedOrderbooks = db.createObjectStore('savedOrderbooks', {
                            keyPath: 'address',
                        });
                        const { tokens = [], orderbooks = [] } = userDataChainConfigs[chainId] ?? {};
                        for (const address of tokens) {
                            await trackedTokens.add({ address });
                        }
                        for (const address of orderbooks) {
                            await savedOrderbooks.add({ address });
                        }
                    }
                }
            });
            this._instance = new UserDataInternal(db);
        }
        return this._instance;
    }

    static get instance(): UserDataInternal {
        if (!this._instance) {
            throw new UserDataNotLoaded();
        }
        return this._instance;
    }

    static unload() {
        this._instance = undefined;
    }

    constructor(private readonly _db: IDBPDatabase<UserDataDBV1>) {
        super();
    }

    async * savedOrderbooks(abortSignal?: AbortSignal): AsyncIterable<Orderbook> {
        for (const { address } of await this._db.getAll('savedOrderbooks')) {
            yield await fetchOrderbook(address, abortSignal);
        }
        checkAbortSignal(abortSignal);
    }

    async saveOrderbook(orderbook: Orderbook, abortSignal?: AbortSignal): Promise<void> {
        const { address } = orderbook;
        await this._db.put('savedOrderbooks', { address });
        checkAbortSignal(abortSignal);
    }

    async forgetOrderbook(orderbook: Orderbook, abortSignal?: AbortSignal): Promise<void> {
        const { address } = orderbook;
        await this._db.delete('savedOrderbooks', address);
        checkAbortSignal(abortSignal);
    }

    async * trackedTokens(abortSignal?: AbortSignal): AsyncIterable<Token> {
        for (const { address } of await this._db.getAll('trackedTokens')) {
            yield await fetchToken(address, abortSignal);
        }
        checkAbortSignal(abortSignal);
    }

    async trackToken(token: Token, abortSignal?: AbortSignal): Promise<void> {
        if (!await this._db.get('trackedTokens', token.address)) {
            await this._db.put('trackedTokens', { address: token.address });
            this.dispatchEvent(new TokenAddedEvent(token));
        }
        checkAbortSignal(abortSignal);
    }

    async forgetToken(token: Token, abortSignal?: AbortSignal): Promise<void> {
        if (await this._db.get('trackedTokens', token.address)) {
            await this._db.delete('trackedTokens', token.address);
            this.dispatchEvent(new TokenRemovedEvent(token));
        }
        checkAbortSignal(abortSignal);
    }
}

/**
 * Event dispatched from UserData.
 */
export abstract class UserDataEvent extends Event {
    constructor(type: UserDataEventType) {
        super(type);
    }
}

/**
 * Event type dispatched when a token has been added to the list of tracked tokens.
 */
export class TokenAddedEvent extends UserDataEvent {
    /** @internal */
    constructor(readonly token: Token) {
        super(UserDataEventType.TOKEN_ADDED);
    }
}

/**
 * Event type dispatched when a token has been removed from the list of tracked tokens.
 */
export class TokenRemovedEvent extends UserDataEvent {
    /** @internal */
    constructor(readonly token: Token) {
        super(UserDataEventType.TOKEN_REMOVED);
    }
}

/**
 * Error thrown when trying to access the user data singleton instance before it is
 * loaded.
 */
export class UserDataNotLoaded extends Error {
    /** @internal */
    constructor() {
        super('UserData Not Loaded');
        this.name = 'UserDataNotLoaded';
    }
}

interface UserDataChainConfig {
    readonly tokens: Address[];
    readonly orderbooks: Address[];
}

export const userDataChainConfigs: { [chainId: number]: UserDataChainConfig | undefined } = {};

userDataChainConfigs[5] = {
    tokens: [
        '0xc04b0d3107736c32e19f1c62b2af67be61d63a05' as Address, // WBTC
        '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6' as Address, // WETH
        '0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c' as Address, // USDC
    ],
    orderbooks: [
        '0x24C2d6AA89b3DCC86a4d75cc85727136C5d5872f' as Address, // WBTC/USDC
        '0xe705DB4Ae1d5E82f14e08B865448ab14498D36fD' as Address, // WETH/USDC
    ],
};

userDataChainConfigs[1337] = {
    tokens: [
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

interface UserDataDBV1 extends DBSchema {
    trackedTokens: {
        key: string;
        value: {
            address: Address;
        };
    },
    savedOrderbooks: {
        key: string;
        value: {
            address: Address;
        };
    },
}
