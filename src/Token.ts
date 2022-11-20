import { formatValue, parseValue } from '@frugal-wizard/abi2ts-lib';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { Address } from './Address';
import { Database } from './Database';
import { asyncCatchError, checkAbortSignal } from './utils';

/**
 * An ERC20 token.
 */
export class Token {
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
        address,
        name,
        symbol,
        decimals,
    }: TokenProperties) {
        this.address = address;
        this.name = name;
        this.symbol = symbol;
        this.decimals = decimals;
    }
}

interface TokenProperties {
    readonly address: Address;
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
}

export async function fetchToken(address: Address, abortSignal?: AbortSignal): Promise<Token> {
    checkAbortSignal(abortSignal);
    try {
        return new Token(await Database.instance.getToken(address, abortSignal));
    } catch {
        const contract = IERC20.at(address);
        const name = await asyncCatchError(contract.name(), NotAnERC20Token);
        checkAbortSignal(abortSignal);
        const symbol = await asyncCatchError(contract.symbol(), NotAnERC20Token);
        checkAbortSignal(abortSignal);
        const decimals = await asyncCatchError(contract.decimals(), NotAnERC20Token);
        checkAbortSignal(abortSignal);
        const token = new Token({ address, name, symbol, decimals });
        await Database.instance.saveToken(token, abortSignal);
        return token;
    }
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
