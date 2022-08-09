interface Scenario {
    only?: boolean;
    description: string;
    existingRanges: [number, number][];
    testedRange: [number, number];
    expectedRanges: [number, number][];
}

const existingRanges: [number, number][] = [[2,4], [6,8], [10,12]];

export const getPriceHistoryRangesScenarios: Scenario[] = [];

getPriceHistoryRangesScenarios.push({
    description: 'when getting all',
    existingRanges,
    testedRange: [0, Infinity],
    expectedRanges: existingRanges,
});

for (const [item, [start, end]] of Object.entries({
    'first': [0, 0],
    'second': [1, 1],
    'third': [2, 2],
    'first and second': [0, 1],
    'second and third': [1, 2],
})) {
    const expectedRanges = existingRanges.slice(start, end+1);
    getPriceHistoryRangesScenarios.push({
        description: `when getting ${item} with exact bounds`,
        existingRanges,
        testedRange: [expectedRanges[0][0], expectedRanges[expectedRanges.length-1][1]],
        expectedRanges,
    });
    getPriceHistoryRangesScenarios.push({
        description: `when getting ${item} with values within range`,
        existingRanges,
        testedRange: [expectedRanges[0][0]+1, expectedRanges[expectedRanges.length-1][1]-1],
        expectedRanges,
    });
    getPriceHistoryRangesScenarios.push({
        description: `when getting ${item} with values containing range`,
        existingRanges,
        testedRange: [expectedRanges[0][0]-1, expectedRanges[expectedRanges.length-1][1]+1],
        expectedRanges,
    });
    getPriceHistoryRangesScenarios.push({
        description: `when getting ${item} with values intersecting start of range`,
        existingRanges,
        testedRange: [expectedRanges[0][0]-1, expectedRanges[expectedRanges.length-1][1]-1],
        expectedRanges,
    });
    getPriceHistoryRangesScenarios.push({
        description: `when getting ${item} with values intersecting end of range`,
        existingRanges,
        testedRange: [expectedRanges[0][0]+1, expectedRanges[expectedRanges.length-1][1]+1],
        expectedRanges,
    });
    if (start == end) {
        getPriceHistoryRangesScenarios.push({
            description: `when getting ${item} with values touching start of range`,
            existingRanges,
            testedRange: [expectedRanges[0][0]-1, expectedRanges[0][0]],
            expectedRanges,
        });
        getPriceHistoryRangesScenarios.push({
            description: `when getting ${item} with values touching end of range`,
            existingRanges,
            testedRange: [expectedRanges[expectedRanges.length-1][1], expectedRanges[expectedRanges.length-1][1]+1],
            expectedRanges,
        });
        getPriceHistoryRangesScenarios.push({
            description: `when getting range just before ${item}`,
            existingRanges,
            testedRange: [expectedRanges[0][0]-1, expectedRanges[0][0]-1],
            expectedRanges: [],
        });
        getPriceHistoryRangesScenarios.push({
            description: `when getting range just after ${item}`,
            existingRanges,
            testedRange: [expectedRanges[expectedRanges.length-1][1]+1, expectedRanges[expectedRanges.length-1][1]+1],
            expectedRanges: [],
        });
    }
}
