import { changeTimeFunctionts, resetTimeFunctions, TimeFunctions } from '../src/time';

let currentTimestamp = Math.floor(Date.now() / 1000);

interface Timeout {
    timestamp: number;
    callback: () => void;
}

const timeouts = new Set<Timeout>();

const mockTimeFunctions: TimeFunctions = {
    now() {
        return currentTimestamp;
    },

    after(seconds, callback) {
        const timestamp = currentTimestamp + seconds;
        const timeout: Timeout = { timestamp, callback };
        timeouts.add(timeout);
        return () => { timeouts.delete(timeout) };
    }
};

export function setTime(timestamp: number) {
    currentTimestamp = timestamp;
    const expired = new Array<Timeout>();
    for (const timeout of timeouts) {
        if (timeout.timestamp <= timestamp) {
            expired.push(timeout);
            timeouts.delete(timeout);
        }
    }
    expired.sort((a, b) => a.timestamp - b.timestamp);
    for (const timeout of expired) {
        timeout.callback();
    }
}

export function setUpTimeMock() {
    changeTimeFunctionts(mockTimeFunctions);
    currentTimestamp = Math.floor(Date.now() / 1000);
}

export function tearDownTimeMock() {
    resetTimeFunctions();
    timeouts.clear();
}
