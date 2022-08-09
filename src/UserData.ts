import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Address } from './Address';
import { Chain } from './Chain';
import { GenericEventListener } from './event-types';
import { fetchOrderbook, Orderbook } from './Orderbook';
import { fetchToken, Token } from './Token';
import { checkAbortSignal } from './utils';

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
            const db = await openDB<UserDataDBV1>(`UserData${chainId}`, 1, {
                async upgrade(db, version) {
                    if (version < 1) {
                        const trackedTokens = db.createObjectStore('trackedTokens', {
                            keyPath: 'address',
                        });
                        const savedOrderbooks = db.createObjectStore('savedOrderbooks', {
                            keyPath: 'address',
                        });
                        const { tokens = [], orderbooks = [] } = chainConfigs[chainId] ?? {};
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

interface ChainConfig {
    readonly tokens: Address[];
    readonly orderbooks: Address[];
}

const chainConfigs: { [chainId: number]: ChainConfig | undefined } = {};

chainConfigs[1337] = {
    tokens: [
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
