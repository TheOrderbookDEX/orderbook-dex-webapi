type ToBlockNumberFunction = (index: number) => number;

interface Scenario {
    only?: boolean;
    description: string;
    existingTicks: bigint[];
    preFetchedRange?: (toBlockNumber: ToBlockNumberFunction) => [number, number];
    testTicks: bigint[];
    expectedCacheRanges: (toBlockNumber: ToBlockNumberFunction) => [number, number][];
}

const testTicks = [ 81n, 99n, 109n, 101n, 100n, 83n, 84n, 118n, 94n, 97n ];

export const listenToPriceHistoryTicksScenarios: Scenario[] = [];

listenToPriceHistoryTicksScenarios.push({
    description: 'when listening for one tick',
    existingTicks: [],
    testTicks: testTicks.slice(0, 1),
    expectedCacheRanges: _ => [[_(0)-1, _(0)-1]],
});

listenToPriceHistoryTicksScenarios.push({
    description: 'when listening for one tick after fetching existing ticks',
    existingTicks: testTicks.slice(0, 5),
    preFetchedRange: _ => [_(0), _(4)],
    testTicks: testTicks.slice(5, 6),
    expectedCacheRanges: _ => [[_(0), _(5)-1]],
});

listenToPriceHistoryTicksScenarios.push({
    description: 'when listening for two ticks',
    existingTicks: [],
    testTicks: testTicks.slice(0, 2),
    expectedCacheRanges: _ => [[_(0)-1, _(1)-1]],
});

listenToPriceHistoryTicksScenarios.push({
    description: 'when listening for two tick after fetching existing ticks',
    existingTicks: testTicks.slice(0, 5),
    preFetchedRange: _ => [_(0), _(4)],
    testTicks: testTicks.slice(5, 7),
    expectedCacheRanges: _ => [[_(0), _(6)-1]],
});

listenToPriceHistoryTicksScenarios.push({
    description: 'when listening for three ticks',
    existingTicks: [],
    testTicks: testTicks.slice(0, 3),
    expectedCacheRanges: _ => [[_(0)-1, _(2)-1]],
});

listenToPriceHistoryTicksScenarios.push({
    description: 'when listening for three tick after fetching existing ticks',
    existingTicks: testTicks.slice(0, 5),
    preFetchedRange: _ => [_(0), _(4)],
    testTicks: testTicks.slice(5, 8),
    expectedCacheRanges: _ => [[_(0), _(7)-1]],
});
