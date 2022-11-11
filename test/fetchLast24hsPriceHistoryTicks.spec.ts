import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { fetchOrderbook } from '../src/Orderbook';
import { Chain } from '../src/Chain';
import { fetchLast24hsPriceHistoryTicks, PriceHistoryTickInternal } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulateTicks } from './smart-contracts';
import { OrderbookDEX, orderbookDEXChainConfigs } from '../src/OrderbookDEX';
import { fetchLast24hsPriceHistoryTicksScenarios } from './scenarios/fetchLast24hsPriceHistoryTicks';
import { getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = orderbookDEXChainConfigs[1337]?.orderbooks[0] as Address;

describe('fetchLast24hsPriceHistoryTicks', function() {
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

    for (const scenario of fetchLast24hsPriceHistoryTicksScenarios) {
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
                addContext(this, {
                    title: 'secondsBetweenTicks',
                    value: scenario.secondsBetweenTicks,
                });
                addContext(this, {
                    title: 'fetchedBlock',
                    value: scenario.fetchedBlock,
                });
                addContext(this, {
                    title: 'expectedTicks',
                    value: scenario.expectedTicks.map(String),
                });
                await simulateTicks(testOrderbook, scenario.existingTicks, scenario.secondsBetweenTicks);
                const latestBlockNumber = await getBlockNumber();
                firstTickBlockNumber = latestBlockNumber - (scenario.existingTicks.length - 1) * 2
            });

            it('should return expected ticks', async function() {
                const orderbook = await fetchOrderbook(testOrderbook);
                const ticks: PriceHistoryTickInternal[] = [];
                for await (const tick of fetchLast24hsPriceHistoryTicks(testOrderbook, scenario.fetchedBlock(toBlockNumber))) {
                    ticks.push(tick);
                }
                expect(ticks)
                    .to.have.length(scenario.expectedTicks.length);
                for (const [ index, tick ] of ticks.entries()) {
                    expect(tick.price)
                        .to.be.equal(scenario.expectedTicks[index] * orderbook.priceTick);
                }
            });
        });
    }
});
