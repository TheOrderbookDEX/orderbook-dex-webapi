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

export async function* createAsyncQueue<T>(fn: (queue: (value: T) => void) => Promise<void>): AsyncIterable<T> {
    const queue: T[] = [];
    let waiting: (() => void) | undefined;
    let done = false;
    let errored = false;
    let error: unknown;

    fn((value) => {
        queue.push(value);
        waiting?.();

    }).then(() => {
        done = true;
        waiting?.();

    }).catch(e => {
        errored = true;
        error = e;
        waiting?.();
    });

    while (true) {
        if (queue.length) {
            yield queue.shift() as T;

        } else {
            if (errored) {
                throw error;
            }

            if (done) break;

            await new Promise<void>(resolve => {
                waiting = () => {
                    waiting = undefined;
                    resolve();
                };
            });
        }
    }
}

export function abortPromise(abortSignal: AbortSignal): Promise<void> {
    return new Promise((_, reject) => {
        abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
    });
}
