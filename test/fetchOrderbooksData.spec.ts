import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fetchOrderbooksData } from '../src/Orderbook';
import { Chain } from '../src/Chain';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { OrderbookPair, setUpSmartContracts, testContracts } from './smart-contracts';
import { OrderbookDEX } from '../src/OrderbookDEX';
import { asyncLast } from './utils';
import { IOrderbook } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbook';

use(chaiAsPromised);

describe('fetchOrderbooksData', function() {
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

    describe('fetching for the first time', function() {
        it('should return expected orderbooks data', async function() {
            const pairs = Object.keys(testContracts.orderbooks) as OrderbookPair[];
            let index = 0;
            for await (const orderbook of fetchOrderbooksData()) {
                const { address, blockNumber } = testContracts.orderbooks[pairs[index]];
                const contract = IOrderbook.at(address);
                expect(orderbook.address)
                    .to.be.equal(address);
                expect(orderbook.version)
                    .to.be.equal(await contract.version());
                expect(orderbook.tradedToken)
                    .to.be.equal(await contract.tradedToken());
                expect(orderbook.baseToken)
                    .to.be.equal(await contract.baseToken());
                expect(orderbook.contractSize)
                    .to.be.equal(await contract.contractSize());
                expect(orderbook.priceTick)
                    .to.be.equal(await contract.priceTick());
                expect(orderbook.creationBlockNumber)
                    .to.be.equal(blockNumber);
                expect(orderbook.factory)
                    .to.be.equal(testContracts.orderbookFactory);
                expect(orderbook.factoryIndex)
                    .to.be.equal(index);
                index++;
            }
            expect(index)
                .to.be.equal(pairs.length);
        });
    });

    describe('fetching for the second time', function() {
        beforeEach(async function() {
            await asyncLast(fetchOrderbooksData());
        });

        it('should return expected orderbooks data', async function() {
            const pairs = Object.keys(testContracts.orderbooks) as OrderbookPair[];
            let index = 0;
            for await (const orderbook of fetchOrderbooksData()) {
                const { address, blockNumber } = testContracts.orderbooks[pairs[index]];
                const contract = IOrderbook.at(address);
                expect(orderbook.address)
                    .to.be.equal(address);
                expect(orderbook.version)
                    .to.be.equal(await contract.version());
                expect(orderbook.tradedToken)
                    .to.be.equal(await contract.tradedToken());
                expect(orderbook.baseToken)
                    .to.be.equal(await contract.baseToken());
                expect(orderbook.contractSize)
                    .to.be.equal(await contract.contractSize());
                expect(orderbook.priceTick)
                    .to.be.equal(await contract.priceTick());
                expect(orderbook.creationBlockNumber)
                    .to.be.equal(blockNumber);
                expect(orderbook.factory)
                    .to.be.equal(testContracts.orderbookFactory);
                expect(orderbook.factoryIndex)
                    .to.be.equal(index);
                index++;
            }
            expect(index)
                .to.be.equal(pairs.length);
        });
    });
});
