export function deepConvertBigIntToString(value: unknown): unknown {
    if (typeof value == 'bigint' || value instanceof BigInt) {
        return value.toString();
    } else if (Array.isArray(value)) {
        return value.map(deepConvertBigIntToString);
    } else if (typeof value == 'object' && value) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepConvertBigIntToString(v)]))
    } else {
        return value;
    }
}

export async function asyncFirst<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
    for await (const item of iterable) {
        return item;
    }
}
