import { Address } from './Address';
import { Orderbook } from './Orderbook';

/**
 * Order type, either sell or buy.
 */
export enum OrderType {
    /**
     * Sell order.
     */
    SELL = 'sell',

    /**
     * Buy order.
     */
    BUY = 'buy',
}

/**
 * Order execution type.
 */
export enum OrderExecutionType {
    /**
     * At market.
     */
    MARKET = 'market',

    /**
     * Limit order.
     */
    LIMIT = 'limit',
}

/**
 * Order status.
 */
export enum OrderStatus {
    /**
     * The order has not yet been mined.
     */
    PENDING = 'pending',

    /**
     * The order is open.
     */
    OPEN = 'open',

    /**
     * The order has not been filled.
     */
    NOT_FILLED = 'notFilled',

    /**
     * The order has been partially filled.
     */
    PARTIALLY_FILLED = 'partiallyFilled',

    /**
     * The order has been filled.
     */
    FILLED = 'filled',

    /**
     * The order is claimable.
     */
    CLAIMABLE = 'claimable',

    /**
     * The order has a claim that has not yet been mined.
     */
    PENDING_CLAIM = 'pendingClaim',

    /**
     * The order has been claimed.
     */
    CLAIMED = 'claimed',

    /**
     * The order is cancelable.
     */
    CANCELABLE = 'cancelable',

    /**
     * The order has a cancelation that has not yet been mined.
     */
    PENDING_CANCEL = 'pendingCancel',

    /**
     * The order has been canceled.
     */
    CANCELED = 'canceled',

    /**
     * The order has been closed.
     */
    CLOSED = 'closed',

    /**
     * There's been an error.
     */
    ERROR = 'error',
}

/**
 * An order.
 */
export interface Order {
    /**
     * A key identified the order.
     */
    readonly key: string;

    /**
     * The owner of this order.
     */
    readonly owner: Address;

    /**
     * The orderbook this order belongs to.
     */
    readonly orderbook: Orderbook;

    /**
     * The timestamp this order began.
     */
    readonly timestamp: number;

    /**
     * Status of the order.
     *
     * An order can have more than one status flag, e.g. confirmed and filled.
     */
    readonly status: readonly OrderStatus[];

    /**
     * Sell/Buy type of order.
     */
    readonly type: OrderType;

    /**
     * Order execution type.
     */
    readonly execution: OrderExecutionType;

    /**
     * The price to buy/sell at.
     *
     * For market orders this is the maximum/minimum price to buy/sell at.
     */
    readonly price: bigint;

    /**
     * The total price for the order at its currently filled position.
     */
    readonly totalPrice: bigint;

    /**
     * The amount claimed from the total price.
     */
    readonly totalPriceClaimed: bigint;

    /**
     * The amount of contracts to buy/sell.
     */
    readonly amount: bigint;

    /**
     * The amount of contracts filled.
     */
    readonly filled: bigint;

    /**
     * The amount of contracts claimed.
     */
    readonly claimed: bigint;

    /**
     * The amount of contracts canceled.
     */
    readonly canceled: bigint;

    /**
     * The error message.
     */
    readonly error: string;
}

export interface OrderInternal extends Order {
    /**
     * The transaction hash of this order.
     */
    readonly txHash: string;

    /**
     * The id of this order.
     */
    readonly id: string;

    /**
     * The transaction hash of the current claim operation.
     */
    readonly claimTxHash: string;

    /**
     * The transaction hash of the current cancel operation.
     */
    readonly cancelTxHash: string;
}
