import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { fetchOrderbook } from '../src/Orderbook';
import { Chain } from '../src/Chain';
import { captureFilledEventFetched, fetchPriceHistoryTicks } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulateTicks } from './smart-contracts';
import { OrderbookDEX } from '../src/OrderbookDEX';
import { Cache } from '../src/Cache';
import { fetchPriceHistoryTicksScenarios } from './scenarios/fetchPriceHistoryTicks';
import { getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = '0xEbF7a4c0856859eE173FAc8Cc7eb0488950538fb' as Address;

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
                    title: 'expectedCacheRanges',
                    value: scenario.expectedCacheRanges,
                });
                await simulateTicks(testOrderbook, scenario.existingTicks);
                latestBlockNumber = await getBlockNumber();
                if (scenario.preFetchedRange) {
                    await fetchPriceHistoryTicks(testOrderbook, ...scenario.preFetchedRange(toBlockNumber));
                }
            });

            it('should return expected ticks', async function() {
                const orderbook = await fetchOrderbook(testOrderbook);
                const ticks = await fetchPriceHistoryTicks(testOrderbook, ...scenario.fetchedRange(toBlockNumber));
                expect(ticks)
                    .to.have.length(scenario.expectedTicks.length);
                for (const [ index, tick ] of ticks.entries()) {
                    expect(tick.price)
                        .to.be.equal(scenario.expectedTicks[index] * orderbook.priceTick);
                }
            });

            it('should leave cache ranges as expected', async function() {
                await fetchPriceHistoryTicks(testOrderbook, ...scenario.fetchedRange(toBlockNumber));
                const ranges = await Cache.instance.getPriceHistoryRanges(testOrderbook, 0, Infinity);
                const expected = scenario.expectedCacheRanges(toBlockNumber);
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
