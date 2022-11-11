import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { Cache } from '../src/Cache';
import { resetIndexedDB } from './indexeddb';
import { addPriceHistoryRangeScenarios } from './scenarios/addPriceHistoryRange';
import { getPriceHistoryRangesScenarios } from './scenarios/getPriceHistoryRanges';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = '0xEbF7a4c0856859eE173FAc8Cc7eb0488950538fb' as Address;

describe('Cache', function() {
    afterEach(async function() {
        Cache.unload();
        resetIndexedDB();
    });

    // no need to test upgrade for now, we are resetting the db in version 3
    describe.skip('upgrade', function() {
        // TODO test Cache upgrade thoroughly

        describe('from version 3', function() {
            beforeEach(async function() {
                await Cache.load(1, 3);
                Cache.unload();
            });

            it('should work', async function() {
                await Cache.load(1);
            });
        });
    });

    describe('functions', function() {
        beforeEach(async function() {
            await Cache.load(1);
        });

        describe('getPriceHistoryRanges', function() {
            for (const scenario of getPriceHistoryRangesScenarios) {
                (scenario.only ? describe.only : describe)(scenario.description, function() {
                    beforeEach(async function() {
                        addContext(this, {
                            title: 'existingRanges',
                            value: scenario.existingRanges,
                        });
                        addContext(this, {
                            title: 'testedRange',
                            value: scenario.testedRange,
                        });
                        addContext(this, {
                            title: 'expectedRanges',
                            value: scenario.expectedRanges,
                        });
                        for (const [fromBlock, toBlock] of scenario.existingRanges) {
                            await Cache.instance.addPriceHistoryRange(testOrderbook, fromBlock, toBlock);
                        }
                    });

                    it('should return expected ranges', async function() {
                        const [fromBlock, toBlock] = scenario.testedRange;
                        const ranges = await Cache.instance.getPriceHistoryRanges(testOrderbook, fromBlock, toBlock);
                        expect(ranges)
                            .to.have.length(scenario.expectedRanges.length);
                        for (const [index, range] of ranges.entries()) {
                            expect(range.fromBlock)
                                .to.be.equal(scenario.expectedRanges[index][0]);
                            expect(range.toBlock)
                                .to.be.equal(scenario.expectedRanges[index][1]);
                        }
                    });
                });
            }
        });

        describe('addPriceHistoryRange', function() {
            for (const scenario of addPriceHistoryRangeScenarios) {
                (scenario.only ? describe.only : describe)(scenario.description, function() {
                    beforeEach(async function() {
                        addContext(this, {
                            title: 'existingRanges',
                            value: scenario.existingRanges,
                        });
                        addContext(this, {
                            title: 'addedRange',
                            value: scenario.addedRange,
                        });
                        addContext(this, {
                            title: 'expectedRanges',
                            value: scenario.expectedRanges,
                        });
                        for (const [fromBlock, toBlock] of scenario.existingRanges) {
                            await Cache.instance.addPriceHistoryRange(testOrderbook, fromBlock, toBlock);
                        }
                    });

                    it('should update ranges as expected', async function() {
                        const [fromBlock, toBlock] = scenario.addedRange;
                        await Cache.instance.addPriceHistoryRange(testOrderbook, fromBlock, toBlock);
                        const ranges = await Cache.instance.getPriceHistoryRanges(testOrderbook, 0, Infinity);
                        expect(ranges)
                            .to.have.length(scenario.expectedRanges.length);
                        for (const [index, range] of ranges.entries()) {
                            expect(range.fromBlock)
                                .to.be.equal(scenario.expectedRanges[index][0]);
                            expect(range.toBlock)
                                .to.be.equal(scenario.expectedRanges[index][1]);
                        }
                    });
                });
            }
        });

        describe.skip('getPriceHistoryTicks', function() {
            // TODO
        });

        describe.skip('savePriceHistoryTick', function() {
            // TODO
        });
    });
});
