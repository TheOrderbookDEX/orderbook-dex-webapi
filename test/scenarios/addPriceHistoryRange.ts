interface Scenario {
    only?: boolean;
    description: string;
    existingRanges: [number, number][];
    addedRange: [number, number];
    expectedRanges: [number, number][];
}

export const addPriceHistoryRangeScenarios: Scenario[] = [
    {
        description: 'when adding first range',
        existingRanges: [],
        addedRange: [10, 12],
        expectedRanges: [[10, 12]],
    },
    {
        description: 'when adding range after existing one',
        existingRanges: [[10, 12]],
        addedRange: [14, 16],
        expectedRanges: [[10, 12], [14, 16]],
    },
    {
        description: 'when adding range before existing one',
        existingRanges: [[10, 12]],
        addedRange: [6, 8],
        expectedRanges: [[6, 8], [10, 12]],
    },
    {
        description: 'when adding range with same bounds as existing one',
        existingRanges: [[10, 12]],
        addedRange: [10, 12],
        expectedRanges: [[10, 12]],
    },
    {
        description: 'when adding range within existing one',
        existingRanges: [[10, 12]],
        addedRange: [11, 11],
        expectedRanges: [[10, 12]],
    },
    {
        description: 'when adding range containing existing one',
        existingRanges: [[10, 12]],
        addedRange: [9, 13],
        expectedRanges: [[9, 13]],
    },
    {
        description: 'when adding range intersecting start of existing one',
        existingRanges: [[10, 12]],
        addedRange: [9, 11],
        expectedRanges: [[9, 12]],
    },
    {
        description: 'when adding range intersecting end of existing one',
        existingRanges: [[10, 12]],
        addedRange: [11, 13],
        expectedRanges: [[10, 13]],
    },
    {
        description: 'when adding range touching start of existing one',
        existingRanges: [[10, 12]],
        addedRange: [8, 10],
        expectedRanges: [[8, 12]],
    },
    {
        description: 'when adding range touching end of existing one',
        existingRanges: [[10, 12]],
        addedRange: [12, 14],
        expectedRanges: [[10, 14]],
    },
    {
        description: 'when adding range just before start of existing one',
        existingRanges: [[10, 12]],
        addedRange: [8, 9],
        expectedRanges: [[8, 12]],
    },
    {
        description: 'when adding range just after end of existing one',
        existingRanges: [[10, 12]],
        addedRange: [13, 14],
        expectedRanges: [[10, 14]],
    },
    {
        description: 'when adding range with same bounds as existing pair',
        existingRanges: [[10, 12], [14, 16]],
        addedRange: [10, 16],
        expectedRanges: [[10, 16]],
    },
    {
        description: 'when adding range intersecting inside of existing pair',
        existingRanges: [[10, 12], [14, 16]],
        addedRange: [11, 15],
        expectedRanges: [[10, 16]],
    },
    {
        description: 'when adding range containing existing pair',
        existingRanges: [[10, 12], [14, 16]],
        addedRange: [9, 17],
        expectedRanges: [[9, 17]],
    },
    {
        description: 'when adding range touching bounds of existing pair',
        existingRanges: [[10, 12], [14, 16]],
        addedRange: [12, 14],
        expectedRanges: [[10, 16]],
    },
    {
        description: 'when adding range just between existing pair',
        existingRanges: [[10, 12], [14, 16]],
        addedRange: [13, 13],
        expectedRanges: [[10, 16]],
    },
];
