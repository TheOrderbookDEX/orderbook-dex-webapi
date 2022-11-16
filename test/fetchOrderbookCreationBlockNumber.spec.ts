import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fetchOrderbookCreationBlockNumber } from '../src/Orderbook';
import { Chain } from '../src/Chain';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { OrderbookPair, setUpSmartContracts, testContracts } from './smart-contracts';
import { OrderbookDEX } from '../src/OrderbookDEX';

use(chaiAsPromised);

describe('fetchOrderbookCreationBlockNumber', function() {
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
        describe(`fetching creation block number for ${pair}`, function() {
            it('should return expected block number', async function() {
                const blockNumber = await fetchOrderbookCreationBlockNumber(testContracts.orderbooks[pair as OrderbookPair].address);
                expect(blockNumber)
                    .to.be.equal(testContracts.orderbooks[pair as OrderbookPair].blockNumber);
            });
        });
    }
});
