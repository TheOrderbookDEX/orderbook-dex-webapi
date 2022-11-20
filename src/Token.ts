import { formatValue, parseValue } from '@frugal-wizard/abi2ts-lib';
import { Address } from './Address';

/**
 * An ERC20 token.
 */
export class Token {
    /**
     * Whether the token is being tracked.
     */
    readonly tracked: boolean;

    /**
     * The address of the token.
     */
    readonly address: Address;

    /**
     * The name of the token.
     */
    readonly name: string;

    /**
     * The symbol of the token.
     */
    readonly symbol: string;

    /**
     * The decimals places of the token.
     */
    readonly decimals: number;

    /**
     * The value of one integer unit of the token.
     */
    get unit(): bigint {
        return 10n ** BigInt(this.decimals);
    }

    /**
     * Format an amount according to the decimal places of the token.
     *
     * @param amount The amount to format.
     * @returns The formatted value.
     */
    formatAmount(amount: bigint): string {
        return formatValue(amount, this.decimals);
    }

    /**
     * Parse an amount according to the decimal places of the token.
     *
     * @param amount The amount to parse.
     * @returns The parsed value.
     */
    parseAmount(amount: string): bigint {
        return parseValue(amount, this.decimals);
    }

    constructor({
        tracked,
        address,
        name,
        symbol,
        decimals,
    }: TokenProperties) {
        this.tracked = tracked;
        this.address = address;
        this.name = name;
        this.symbol = symbol;
        this.decimals = decimals;
    }
}

interface TokenProperties {
    readonly tracked: boolean;
    readonly address: Address;
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
}

/**
 * Error thrown when a given address fails to conform to the ERC20 token standard.
 */
export class NotAnERC20Token extends Error {
    constructor() {
        super('Not An ERC20 Token');
        this.name = 'NotAnERC20Token';
    }
}
