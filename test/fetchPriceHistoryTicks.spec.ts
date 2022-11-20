import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { Chain } from '../src/Chain';
import { captureFilledEventFetched, fetchPriceHistoryTicks } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulateTicks } from './smart-contracts';
import { OrderbookDEX, orderbookDEXChainConfigs } from '../src/OrderbookDEX';
import { Database } from '../src/Database';
import { fetchPriceHistoryTicksScenarios } from './scenarios/fetchPriceHistoryTicks';
import { getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = orderbookDEXChainConfigs[1337]?.orderbooks[0] as Address;

describe('fetchPriceHistoryTicks', function() {
    beforeEach(async function() {
        await setUpEthereumProvider();
        await Chain.connect();
        await setUpSmartContracts();
        await OrderbookDEX.connect();
    });

    afterEach(async function() {
        OrderbookDEX.disconnect();
        Chain.disconnect();
        await tearDownEthereumProvider();
        resetIndexedDB();
    });

    for (const scenario of fetchPriceHistoryTicksScenarios) {
        (scenario.only ? describe.only : describe)(scenario.description, function() {
            let latestBlockNumber: number;

            function toBlockNumber(index: number) {
                return latestBlockNumber - (scenario.existingTicks.length - 1 - index) * 2;
            }

            beforeEach(async function() {
                addContext(this, {
                    title: 'existingTicks',
                    value: scenario.existingTicks.map(String),
                });
                if (scenario.preFetchedRange) {
                    addContext(this, {
                        title: 'preFetchedRange',
                        value: scenario.preFetchedRange,
                    });
                }
                addContext(this, {
                    title: 'fetchedRange',
                    value: scenario.fetchedRange,
                });
                addContext(this, {
                    title: 'expectedTicks',
                    value: scenario.expectedTicks.map(String),
                });
                addContext(this, {
                    title: 'expectedDatabaseRanges',
                    value: scenario.expectedDatabaseRanges,
                });
                await simulateTicks(testOrderbook, scenario.existingTicks);
                latestBlockNumber = await getBlockNumber();
                if (scenario.preFetchedRange) {
                    await fetchPriceHistoryTicks(testOrderbook, ...scenario.preFetchedRange(toBlockNumber));
                }
            });

            it('should return expected ticks', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(testOrderbook);
                const ticks = await fetchPriceHistoryTicks(testOrderbook, ...scenario.fetchedRange(toBlockNumber));
                expect(ticks)
                    .to.have.length(scenario.expectedTicks.length);
                for (const [ index, tick ] of ticks.entries()) {
                    expect(tick.price)
                        .to.be.equal(scenario.expectedTicks[index] * orderbook.priceTick);
                }
            });

            it('should leave database ranges as expected', async function() {
                await fetchPriceHistoryTicks(testOrderbook, ...scenario.fetchedRange(toBlockNumber));
                const ranges = await Database.instance.getPriceHistoryRanges(testOrderbook, 0, Infinity);
                const expected = scenario.expectedDatabaseRanges(toBlockNumber);
                expect(ranges)
                    .to.have.length(expected.length);
                for (const [ index, { fromBlock, toBlock } ] of ranges.entries()) {
                    expect(fromBlock)
                        .to.be.equal(expected[index][0]);
                    expect(toBlock)
                        .to.be.equal(expected[index][1]);
                }
            });

            it('should only fetch the expected Filled events', async function() {
                const captured = await captureFilledEventFetched(async () => {
                    await fetchPriceHistoryTicks(testOrderbook, ...scenario.fetchedRange(toBlockNumber));
                });
                const expected = scenario.expectedFilledFetched(toBlockNumber);
                expect(captured)
                    .to.have.length(expected.length);
                for (const [ index, [, fromBlock, toBlock] ] of captured.entries()) {
                    expect(fromBlock)
                        .to.be.equal(expected[index][0]);
                    expect(toBlock)
                        .to.be.equal(expected[index][1]);
                }
            });
        });
    }
});
