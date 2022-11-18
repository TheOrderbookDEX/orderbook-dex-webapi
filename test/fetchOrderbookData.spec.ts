import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fetchOrderbookData } from '../src/Orderbook';
import { Chain } from '../src/Chain';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { OrderbookPair, setUpSmartContracts, testContracts } from './smart-contracts';
import { OrderbookDEX } from '../src/OrderbookDEX';

use(chaiAsPromised);

describe('fetchOrderbookData', function() {
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

    for (const pair in testContracts.orderbooks) {
        describe(`fetching orderbook data for ${pair}`, function() {
            // TODO test other orderbook data

            it('should return expected block number', async function() {
                const { creationBlockNumber } = await fetchOrderbookData(testContracts.orderbooks[pair as OrderbookPair].address);
                expect(creationBlockNumber)
                    .to.be.equal(testContracts.orderbooks[pair as OrderbookPair].blockNumber);
            });
        });
    }
});
