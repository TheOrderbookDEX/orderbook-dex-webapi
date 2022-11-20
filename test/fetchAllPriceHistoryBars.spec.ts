import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { Chain, ChainInternal } from '../src/Chain';
import { fetchAllPriceHistoryBars } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulatePriceHistory } from './smart-contracts';
import { OrderbookDEX, orderbookDEXConfigs } from '../src/OrderbookDEX';
import { TimeFrame, PriceHistoryBar } from '../src/PriceHistory';
import { deepConvertBigIntToString } from './utils';
import { fetchAllPriceHistoryBarsScenarios } from './scenarios/fetchAllPriceHistoryBars';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = orderbookDEXConfigs[1337]?.orderbooks[0] as Address;
const testTimeFrame = TimeFrame.MINUTES_15 as number;

describe('fetchAllPriceHistoryBars', function() {
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

    for (const scenario of fetchAllPriceHistoryBarsScenarios) {
        (scenario.only ? describe.only : describe)(scenario.description, function() {
            beforeEach(async function() {
                addContext(this, {
                    title: 'priceHistory',
                    value: deepConvertBigIntToString(scenario.priceHistory),
                });
                if (scenario.MAX_GET_LOGS_BLOCKS) {
                    addContext(this, {
                        title: 'MAX_GET_LOGS_BLOCKS',
                        value: scenario.MAX_GET_LOGS_BLOCKS,
                    });
                }
                await simulatePriceHistory(testOrderbook, testTimeFrame, scenario.priceHistory);
            });

            it('should return expected bars', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(testOrderbook);
                const prev_MAX_GET_LOGS_BLOCKS = ChainInternal.instance.MAX_GET_LOGS_BLOCKS;
                if (scenario.MAX_GET_LOGS_BLOCKS) {
                    ChainInternal.instance.MAX_GET_LOGS_BLOCKS = scenario.MAX_GET_LOGS_BLOCKS;
                }
                const bars: PriceHistoryBar[] = [];
                for await (const bar of fetchAllPriceHistoryBars(testOrderbook, testTimeFrame)) {
                    bars.push(bar);
                }
                ChainInternal.instance.MAX_GET_LOGS_BLOCKS = prev_MAX_GET_LOGS_BLOCKS;
                expect(bars)
                    .to.have.length(scenario.priceHistory.length);
                for (const [index, bar] of bars.reverse().entries()) {
                    const expected = scenario.priceHistory[index];
                    expect(bar.open)
                        .to.be.equal(expected.open * orderbook.priceTick);
                    expect(bar.high)
                        .to.be.equal(expected.high * orderbook.priceTick);
                    expect(bar.low)
                        .to.be.equal(expected.low * orderbook.priceTick);
                    expect(bar.close)
                        .to.be.equal(expected.close * orderbook.priceTick);
                }
            });
        });
    }
});
