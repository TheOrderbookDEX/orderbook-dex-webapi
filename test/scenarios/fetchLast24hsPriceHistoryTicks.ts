type ToBlockNumberFunction = (index: number) => number;

interface Scenario {
    only?: boolean;
    description: string;
    existingTicks: bigint[];
    secondsBetweenTicks: number;
    fetchedBlock: (toBlockNumber: ToBlockNumberFunction) => number;
    expectedTicks: bigint[];
}

export const fetchLast24hsPriceHistoryTicksScenarios: Scenario[] = [];

const testTicks = [ 81n, 99n, 109n, 101n, 100n, 83n, 84n, 118n, 94n, 97n ];

fetchLast24hsPriceHistoryTicksScenarios.push({
    description: 'when fetching for last block with test ticks at 24hs intervals',
    existingTicks: testTicks,
    secondsBetweenTicks: 24*60*60+1,
    fetchedBlock: _ => _(testTicks.length-1),
    expectedTicks: testTicks.slice(-2).reverse(),
});

fetchLast24hsPriceHistoryTicksScenarios.push({
    description: 'when fetching for next to last block with test ticks at 24hs intervals',
    existingTicks: testTicks,
    secondsBetweenTicks: 24*60*60+1,
    fetchedBlock: _ => _(testTicks.length-2),
    expectedTicks: testTicks.slice(-3, -1).reverse(),
});

fetchLast24hsPriceHistoryTicksScenarios.push({
    description: 'when fetching for last block with test ticks at 12hs intervals',
    existingTicks: testTicks,
    secondsBetweenTicks: 12*60*60+1,
    fetchedBlock: _ => _(testTicks.length-1),
    expectedTicks: testTicks.slice(-3).reverse(),
});

fetchLast24hsPriceHistoryTicksScenarios.push({
    description: 'when fetching for next to last block with test ticks at 12hs intervals',
    existingTicks: testTicks,
    secondsBetweenTicks: 12*60*60+1,
    fetchedBlock: _ => _(testTicks.length-2),
    expectedTicks: testTicks.slice(-4, -1).reverse(),
});

fetchLast24hsPriceHistoryTicksScenarios.push({
    description: 'when fetching for last block with test ticks at 6hs intervals',
    existingTicks: testTicks,
    secondsBetweenTicks: 6*60*60+1,
    fetchedBlock: _ => _(testTicks.length-1),
    expectedTicks: testTicks.slice(-5).reverse(),
});

fetchLast24hsPriceHistoryTicksScenarios.push({
    description: 'when fetching for next to last block with test ticks at 6hs intervals',
    existingTicks: testTicks,
    secondsBetweenTicks: 6*60*60+1,
    fetchedBlock: _ => _(testTicks.length-2),
    expectedTicks: testTicks.slice(-6, -1).reverse(),
});
