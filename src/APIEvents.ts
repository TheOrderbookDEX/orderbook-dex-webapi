import { GenericEventListener } from './event-types';

export enum APIEventType {
    /**
     * Event type dispatched when the wallet is connected.
     */
    WALLET_CONNECTED = 'walletConnected',
}

/**
 * Global API events.
 */
export class APIEvents extends EventTarget {
    private static _instance: APIEvents;

    /**
     * The global API events instance.
     */
    static get instance(): APIEvents {
        if (!this._instance) {
            this._instance = new APIEvents();
        }
        return this._instance;
    }

    private constructor() {
        super();
    }

    addEventListener(type: APIEventType.WALLET_CONNECTED, callback: GenericEventListener<WalletConnectedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: APIEventType, callback: GenericEventListener<APIEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: APIEventType.WALLET_CONNECTED, callback: GenericEventListener<WalletConnectedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: APIEventType, callback: GenericEventListener<APIEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    /** @internal */
    dispatchEvent(event: APIEvent): boolean {
        return super.dispatchEvent(event);
    }
}

/**
 * Event dispatched from APIEvents.
 */
export abstract class APIEvent extends Event {
    constructor(type: APIEventType) {
        super(type);
    }
}

/**
 * Event dispatched when the wallet is connected.
 */
export class WalletConnectedEvent extends APIEvent {
    /** @internal */
    constructor() {
        super(APIEventType.WALLET_CONNECTED);
    }
}
