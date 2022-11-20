import { hexstring } from '@frugal-wizard/abi2ts-lib';
import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { Address } from '../src/Address';
import { Database } from '../src/Database';
import { orderbookDEXChainConfigs } from '../src/OrderbookDEX';
import { resetIndexedDB } from './indexeddb';
import { addPriceHistoryRangeScenarios } from './scenarios/addPriceHistoryRange';
import { getPriceHistoryRangesScenarios } from './scenarios/getPriceHistoryRanges';

use(chaiAsPromised);

const testOrderbook = orderbookDEXChainConfigs[1337]?.orderbooks[0] as Address;

describe('Database', function() {
    afterEach(async function() {
        Database.unload();
        resetIndexedDB();
    });

    // no need to test upgrade for now
    describe.skip('upgrade', function() {
        // TODO test Database upgrade thoroughly

        describe('from version 1', function() {
            beforeEach(async function() {
                await Database.load(1, 1);
                Database.unload();
            });

            it('should work', async function() {
                await Database.load(1);
            });
        });
    });

    describe('functions', function() {
        beforeEach(async function() {
            await Database.load(1);
        });

        describe('getOrderbooks', function() {
            beforeEach(async function() {
                for (let n = 1; n <= Database.GET_ORDERBOOKS_BATCH + 1; n++) {
                    await Database.instance.saveOrderbook({
                        address: hexstring(0x1000000000000000000000000000000000000000n + BigInt(n)) as Address,
                        version: 10000n,
                        tradedToken: hexstring(0x2000000000000000000000000000000000000000n + BigInt(n)) as Address,
                        baseToken: hexstring(0x3000000000000000000000000000000000000000n + BigInt(n)) as Address,
                        contractSize: BigInt(n) * 2n,
                        priceTick: BigInt(n) * 2n + 1n,
                        creationBlockNumber: n,
                        factory: '0x1000000000000000000000000000000000000000' as Address,
                        factoryIndex: n - 1,
                    });
                }
            });

            it('should return all orderbooks sorted by factory index', async function() {
                let n = 0;
                for await (const orderbook of Database.instance.getOrderbooks('0x1000000000000000000000000000000000000000' as Address)) {
                    n++;
                    expect(orderbook.address)
                        .to.be.equal(hexstring(0x1000000000000000000000000000000000000000n + BigInt(n)));
                    expect(orderbook.version)
                        .to.be.equal(10000n);
                    expect(orderbook.tradedToken)
                        .to.be.equal(hexstring(0x2000000000000000000000000000000000000000n + BigInt(n)));
                    expect(orderbook.baseToken)
                        .to.be.equal(hexstring(0x3000000000000000000000000000000000000000n + BigInt(n)));
                    expect(orderbook.contractSize)
                        .to.be.equal(BigInt(n) * 2n);
                    expect(orderbook.priceTick)
                        .to.be.equal(BigInt(n) * 2n + 1n);
                    expect(orderbook.creationBlockNumber)
                        .to.be.equal(n);
                    expect(orderbook.factory)
                        .to.be.equal('0x1000000000000000000000000000000000000000');
                    expect(orderbook.factoryIndex)
                        .to.be.equal(n - 1);
                }
                expect(n)
                    .to.be.equal(Database.GET_ORDERBOOKS_BATCH + 1);
            });
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
                            await Database.instance.addPriceHistoryRange(testOrderbook, fromBlock, toBlock);
                        }
                    });

                    it('should return expected ranges', async function() {
                        const [fromBlock, toBlock] = scenario.testedRange;
                        const ranges = await Database.instance.getPriceHistoryRanges(testOrderbook, fromBlock, toBlock);
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
                            await Database.instance.addPriceHistoryRange(testOrderbook, fromBlock, toBlock);
                        }
                    });

                    it('should update ranges as expected', async function() {
                        const [fromBlock, toBlock] = scenario.addedRange;
                        await Database.instance.addPriceHistoryRange(testOrderbook, fromBlock, toBlock);
                        const ranges = await Database.instance.getPriceHistoryRanges(testOrderbook, 0, Infinity);
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
