export function checkAbortSignal(abortSignal?: AbortSignal) {
    if (abortSignal?.aborted) throw abortSignal.reason;
}

export function isAbortReason(abortSignal: AbortSignal | undefined, error: unknown) {
    return abortSignal?.aborted && abortSignal.reason === error;
}

export function createSubAbortController(abortSignal?: AbortSignal) {
    const abortController = new AbortController();
    abortSignal?.addEventListener('abort', () => abortController.abort(), { signal: abortController.signal });
    return abortController;
}

export async function asyncCatchError<T>(promise: Promise<T>, error: { new (): Error }): Promise<T> {
    try {
        return await promise;
    } catch {
        throw new error;
    }
}

export async function asyncFirst<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
    for await (const item of iterable) {
        return item;
    }
}

export function max<T>(a: T, b: T): T {
    return a > b ? a : b;
}

export function min<T>(a: T, b: T): T {
    return a < b ? a : b;
}
