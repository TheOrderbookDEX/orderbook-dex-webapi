import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { Chain } from '../src/Chain';
import { fetchPriceHistoryTicks, listenToPriceHistoryTicks, PriceHistoryTickInternal } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulateTicks } from './smart-contracts';
import { OrderbookDEX, orderbookDEXChainConfigs } from '../src/OrderbookDEX';
import { Database } from '../src/Database';
import { listenToPriceHistoryTicksScenarios } from './scenarios/listenToPriceHistoryTicks';
import { ChainEvents } from '../src/ChainEvents';
import { getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = orderbookDEXChainConfigs[1337]?.orderbooks[0] as Address;

describe('listenToPriceHistoryTicks', function() {
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

    for (const scenario of listenToPriceHistoryTicksScenarios) {
        (scenario.only ? describe.only : describe)(scenario.description, function() {
            let firstTickBlockNumber: number;

            function toBlockNumber(index: number) {
                return firstTickBlockNumber + index * 2;
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
                    title: 'testTicks',
                    value: scenario.testTicks.map(String),
                });
                addContext(this, {
                    title: 'expectedDatabaseRanges',
                    value: scenario.expectedDatabaseRanges,
                });
                await simulateTicks(testOrderbook, scenario.existingTicks);
                const latestBlockNumber = await getBlockNumber();
                firstTickBlockNumber = latestBlockNumber - (scenario.existingTicks.length - 1) * 2
                if (scenario.preFetchedRange) {
                    await fetchPriceHistoryTicks(testOrderbook, ...scenario.preFetchedRange(toBlockNumber));
                }
                await ChainEvents.instance.forceUpdate();
            });

            it('should capture expected ticks', async function() {
                const abortController = new AbortController();
                try {
                    const abortSignal = abortController.signal;
                    const orderbook = await OrderbookDEX.instance.getOrderbook(testOrderbook);
                    const ticks: PriceHistoryTickInternal[] = [];
                    const waitForListener = listenToPriceHistoryTicks(testOrderbook, abortSignal, tick => ticks.push(tick));
                    await simulateTicks(testOrderbook, scenario.testTicks);
                    await ChainEvents.instance.forceUpdate();
                    await waitForListener();
                    expect(ticks)
                        .to.have.length(scenario.testTicks.length);
                    for (const [ index, tick ] of ticks.entries()) {
                        expect(tick.price)
                            .to.be.equal(scenario.testTicks[index] * orderbook.priceTick);
                    }
                } finally {
                    abortController.abort();
                }
            });

            it('should leave database ranges as expected', async function() {
                const abortController = new AbortController();
                try {
                    const abortSignal = abortController.signal;
                    const waitForListener = listenToPriceHistoryTicks(testOrderbook, abortSignal, () => undefined);
                    await simulateTicks(testOrderbook, scenario.testTicks);
                    await ChainEvents.instance.forceUpdate();
                    await waitForListener();
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
                } finally {
                    abortController.abort();
                }
            });
        });
    }
});
