interface Callback {
    (): void;
}

interface AbortFunction {
    (): void;
}

export interface TimeFunctions {
    now(): number;
    after(seconds: number, callback: Callback): AbortFunction;
}

const defaultTimeFunctions: TimeFunctions = {
    now() {
        return Math.floor(Date.now() / 1000);
    },

    after(seconds, callback) {
        const id = setTimeout(callback, seconds * 1000);
        return () => clearTimeout(id);
    }
};

let time = defaultTimeFunctions;

export function now() {
    return time.now();
}

export function after(seconds: number, callback: Callback): AbortFunction {
    return time.after(seconds, callback);
}

export function changeTimeFunctionts(timeFunctions: TimeFunctions) {
    time = timeFunctions;
}

export function resetTimeFunctions() {
    time = defaultTimeFunctions;
}
