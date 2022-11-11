import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { fetchOrderbook } from '../src/Orderbook';
import { Chain } from '../src/Chain';
import { fetchPriceHistoryBarAtBlock } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulatePriceHistory } from './smart-contracts';
import { OrderbookDEX, orderbookDEXChainConfigs } from '../src/OrderbookDEX';
import { fetchPriceHistoryBarAtBlockScenarios } from './scenarios/fetchPriceHistoryBarAtBlock';
import { TimeFrame } from '../src/PriceHistory';
import { deepConvertBigIntToString } from './utils';
import { getBlockNumber } from '@frugal-wizard/abi2ts-lib';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = orderbookDEXChainConfigs[1337]?.orderbooks[0] as Address;
const testTimeFrame = TimeFrame.MINUTES_15 as number;

describe('fetchPriceHistoryBarAtBlock', function() {
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

    for (const scenario of fetchPriceHistoryBarAtBlockScenarios) {
        (scenario.only ? describe.only : describe)(scenario.description, function() {
            beforeEach(async function() {
                addContext(this, {
                    title: 'priceHistory',
                    value: deepConvertBigIntToString(scenario.priceHistory),
                });
                addContext(this, {
                    title: 'expectedBar',
                    value: deepConvertBigIntToString(scenario.expectedBar),
                });
                await simulatePriceHistory(testOrderbook, testTimeFrame, scenario.priceHistory);
            });

            it('should return expected bar', async function() {
                const blockNumber = await getBlockNumber();
                const orderbook = await fetchOrderbook(testOrderbook);
                const bar = await fetchPriceHistoryBarAtBlock(testOrderbook, testTimeFrame, blockNumber);
                if (scenario.expectedBar){
                    expect(bar)
                        .to.exist;
                    if (bar) {
                        expect(bar.open)
                            .to.be.equal(scenario.expectedBar.open * orderbook.priceTick);
                        expect(bar.high)
                            .to.be.equal(scenario.expectedBar.high * orderbook.priceTick);
                        expect(bar.low)
                            .to.be.equal(scenario.expectedBar.low * orderbook.priceTick);
                        expect(bar.close)
                            .to.be.equal(scenario.expectedBar.close * orderbook.priceTick);
                    }
                } else {
                    expect(bar)
                        .to.be.undefined;
                }
            });
        });
    }
});
