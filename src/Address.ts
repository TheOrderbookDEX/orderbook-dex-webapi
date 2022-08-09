declare const validAddress: unique symbol;

/**
 * A blockchain address.
 *
 * Must be a string starting with 0x followed by 40 hexadecimal digits.
 */
export type Address = string & { [validAddress]: true };

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export function isAddress(value: unknown): value is Address {
    if (typeof value == 'string') {
        if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
            return true;
        }
    }
    return false;
}
