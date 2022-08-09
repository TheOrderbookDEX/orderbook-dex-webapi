import { Address, isAddress, ZERO_ADDRESS } from './Address';

declare const validOrderbookConfig: unique symbol;

/**
 * Orderbook initialization configuration.
 */
export interface OrderbookConfig {
    [validOrderbookConfig]: true;

    /**
     * The address of the traded token.
     *
     * Must not be the zero address nor the same as base token.
     */
    tradedToken: Address;

    /**
     * The address of the base token.
     *
     * Must not be the zero address nor the same as traded token.
     */
    baseToken: Address;

    /**
     * The size of a contract in traded token.
     *
     * Must not be zero.
     */
    contractSize: bigint;

    /**
     * The price tick in base token.
     *
     * Must not be zero.
     */
    priceTick: bigint;
}

/**
 * Valid orderbook initialization configuration.
 */
export interface ValidOrderbookConfig extends OrderbookConfig {
    [validOrderbookConfig]: true;
}

export function isValidOrderbookConfig(value: OrderbookConfig): value is ValidOrderbookConfig {
    if (!isAddress(value.tradedToken)) {
        return false;
    }
    if (value.tradedToken === ZERO_ADDRESS) {
        return false;
    }
    if (!isAddress(value.baseToken)) {
        return false;
    }
    if (value.baseToken === ZERO_ADDRESS) {
        return false;
    }
    if (value.tradedToken === value.baseToken) {
        return false;
    }
    if (typeof value.contractSize != 'bigint') {
        return false;
    }
    if (value.contractSize === 0n) {
        return false;
    }
    if (typeof value.priceTick != 'bigint') {
        return false;
    }
    if (value.priceTick === 0n) {
        return false;
    }
    return true;
}

