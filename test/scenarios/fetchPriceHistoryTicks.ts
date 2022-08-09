type ToBlockNumberFunction = (index: number) => number;

interface Scenario {
    only?: boolean;
    description: string;
    existingTicks: bigint[];
    preFetchedRange?: (toBlockNumber: ToBlockNumberFunction) => [number, number];
    fetchedRange: (toBlockNumber: ToBlockNumberFunction) => [number, number];
    expectedTicks: bigint[];
    expectedCacheRanges: (toBlockNumber: ToBlockNumberFunction) => [number, number][];
    expectedFilledFetched: (toBlockNumber: ToBlockNumberFunction) => [number, number][];
}

export const fetchPriceHistoryTicksScenarios: Scenario[] = [];

const existingTicks = [ 81n, 99n, 109n, 101n, 100n, 83n, 84n, 118n, 94n, 97n ];

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching all for the first time',
    existingTicks,
    fetchedRange: _ => [_(0), _(9)],
    expectedTicks: existingTicks,
    expectedCacheRanges: _ => [[_(0), _(9)]],
    expectedFilledFetched: _ => [[_(0), _(9)]],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching all a second time',
    existingTicks,
    preFetchedRange: _ => [_(0), _(9)],
    fetchedRange: _ => [_(0), _(9)],
    expectedTicks: existingTicks,
    expectedCacheRanges: _ => [[_(0), _(9)]],
    expectedFilledFetched: () => [],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching earlier half',
    existingTicks,
    fetchedRange: _ => [_(0), _(4)],
    expectedTicks: existingTicks.slice(0, 5),
    expectedCacheRanges: _ => [[_(0), _(4)]],
    expectedFilledFetched: _ => [[_(0), _(4)]],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching later half',
    existingTicks,
    fetchedRange: _ => [_(5), _(9)],
    expectedTicks: existingTicks.slice(5, 10),
    expectedCacheRanges: _ => [[_(5), _(9)]],
    expectedFilledFetched: _ => [[_(5), _(9)]],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching earlier half after fetching all',
    existingTicks,
    preFetchedRange: _ => [_(0), _(9)],
    fetchedRange: _ => [_(0), _(4)],
    expectedTicks: existingTicks.slice(0, 5),
    expectedCacheRanges: _ => [[_(0), _(9)]],
    expectedFilledFetched: () => [],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching later half after fetching all',
    existingTicks,
    preFetchedRange: _ => [_(0), _(9)],
    fetchedRange: _ => [_(5), _(9)],
    expectedTicks: existingTicks.slice(5, 10),
    expectedCacheRanges: _ => [[_(0), _(9)]],
    expectedFilledFetched: () => [],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching all after fetching earlier half',
    existingTicks,
    preFetchedRange: _ => [_(0), _(4)],
    fetchedRange: _ => [_(0), _(9)],
    expectedTicks: existingTicks,
    expectedCacheRanges: _ => [[_(0), _(9)]],
    expectedFilledFetched: _ => [[_(4)+1, _(9)]],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching all after fetching later half',
    existingTicks,
    preFetchedRange: _ => [_(5), _(9)],
    fetchedRange: _ => [_(0), _(9)],
    expectedTicks: existingTicks,
    expectedCacheRanges: _ => [[_(0), _(9)]],
    expectedFilledFetched: _ => [[_(0), _(5)-1]],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching earlier half after fetching later half',
    existingTicks,
    preFetchedRange: _ => [_(5), _(9)],
    fetchedRange: _ => [_(0), _(4)],
    expectedTicks: existingTicks.slice(0, 5),
    expectedCacheRanges: _ => [[_(0), _(4)], [_(5), _(9)]],
    expectedFilledFetched: _ => [[_(0), _(4)]],
});

fetchPriceHistoryTicksScenarios.push({
    description: 'when fetching later half after fetching earlier half',
    existingTicks,
    preFetchedRange: _ => [_(0), _(4)],
    fetchedRange: _ => [_(5), _(9)],
    expectedTicks: existingTicks.slice(5, 10),
    expectedCacheRanges: _ => [[_(0), _(4)], [_(5), _(9)]],
    expectedFilledFetched: _ => [[_(5), _(9)]],
});
