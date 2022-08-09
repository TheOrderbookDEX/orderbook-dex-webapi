import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import addContext from 'mochawesome/addContext';
import { fetchOrderbook } from '../src/Orderbook';
import { Chain, ChainInternal } from '../src/Chain';
import { fetchPriceHistoryBarAtBlock } from '../src/PriceHistory';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, simulatePriceHistory } from './smart-contracts';
import { OrderbookDEX, OrderbookDEXInternal } from '../src/OrderbookDEX';
import { Cache } from '../src/Cache';
import { fetchPriceHistoryBarAtBlockScenarios } from './scenarios/fetchPriceHistoryBarAtBlock';
import { TimeFrame } from '../src/PriceHistory';
import { deepConvertBigIntToString } from './utils';
import { getBlockNumber } from '@theorderbookdex/abi2ts-lib';
import { Address } from '../src/Address';

use(chaiAsPromised);

const testOrderbook = '0xEbF7a4c0856859eE173FAc8Cc7eb0488950538fb' as Address;
const testTimeFrame = TimeFrame.MINUTES_15 as number;

describe('fetchPriceHistoryBarAtBlock', function() {
    beforeEach(async function() {
        await setUpEthereumProvider();
        await Chain.connect();
        await setUpSmartContracts();
        await OrderbookDEX.connect();
    });

    afterEach(async function() {
        OrderbookDEXInternal.disconnect();
        ChainInternal.disconnect();
        await tearDownEthereumProvider();
        resetIndexedDB();
        Cache.reset();
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
