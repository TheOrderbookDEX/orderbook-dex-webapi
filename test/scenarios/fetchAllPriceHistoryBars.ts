import { simulatePriceHistory } from '../smart-contracts';

type PriceHistory = Parameters<typeof simulatePriceHistory>[2];

const testPriceHistory: PriceHistory = [
    { close: 103n, high: 110n, low: 80n, open: 99n },
    { close: 91n,  high: 118n, low: 88n, open: 91n },
    { close: 105n, high: 113n, low: 92n, open: 92n },
    { close: 103n, high: 120n, low: 81n, open: 102n },
    { close: 106n, high: 118n, low: 90n, open: 90n },
    { close: 89n,  high: 122n, low: 77n, open: 102n },
    { close: 108n, high: 115n, low: 76n, open: 76n },
    { close: 90n,  high: 112n, low: 82n, open: 84n },
    { close: 94n,  high: 111n, low: 79n, open: 100n },
    { close: 99n,  high: 134n, low: 85n, open: 96n }
];

interface Scenario {
    only?: boolean;
    description: string;
    priceHistory: PriceHistory;
    MAX_GET_LOGS_BLOCKS?: number;
}

export const fetchAllPriceHistoryBarsScenarios: Scenario[] = [];

fetchAllPriceHistoryBarsScenarios.push({
    description: `with price history of length 0`,
    priceHistory: [],
});

for (const index of testPriceHistory.keys()) {
    fetchAllPriceHistoryBarsScenarios.push({
        description: `with price history of length ${index+1}`,
        priceHistory: testPriceHistory.slice(0, index+1),
    });
}

for (let MAX_GET_LOGS_BLOCKS = 2; MAX_GET_LOGS_BLOCKS <= 16; MAX_GET_LOGS_BLOCKS += 2) {
    fetchAllPriceHistoryBarsScenarios.push({
        description: `with MAX_GET_LOGS_BLOCKS=${MAX_GET_LOGS_BLOCKS}`,
        priceHistory: testPriceHistory,
        MAX_GET_LOGS_BLOCKS,
    });
}
