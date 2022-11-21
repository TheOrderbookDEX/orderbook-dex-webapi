import { IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Orderbook, OrderbookDEX, OrderbookDEXNotConnected } from '../src';
import { Chain, ChainNotConnected } from '../src/Chain';
import { devnetConfig } from '../src/OrderbookDEX';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { giveMeFunds, setUpSmartContracts, testContracts } from './smart-contracts';

use(chaiAsPromised);

describe('OrderbookDEX', function() {
    describe('static', function() {
        before(async function() {
            await setUpEthereumProvider();
        });

        after(async function() {
            await tearDownEthereumProvider();
        });

        afterEach(function() {
            resetIndexedDB();
        });

        describe('connect', function() {
            describe('before connecting chain', function() {
                it('should fail with ChainNotConnected', async function() {
                    await expect(OrderbookDEX.connect())
                        .to.be.rejectedWith(ChainNotConnected);
                });
            });

            describe('after connecting chain', function() {
                beforeEach(async function() {
                    await Chain.connect();
                    await setUpSmartContracts();
                });

                afterEach(function() {
                    OrderbookDEX.disconnect();
                    Chain.disconnect();
                });

                it('should provide OrderbookDEX instance', async function() {
                    expect(await OrderbookDEX.connect())
                        .to.be.equal(OrderbookDEX.instance);
                });
            });
        });

        describe('instance', function() {
            beforeEach(async function() {
                await Chain.connect();
                await setUpSmartContracts();
            });

            afterEach(function() {
                Chain.disconnect();
            });

            describe('before connect', function() {
                it('should fail with OrderbookDEXNotConnected', function() {
                    expect(() => OrderbookDEX.instance)
                        .to.throw(OrderbookDEXNotConnected)
                });
            });

            describe('after connect', function() {
                beforeEach(async function() {
                    await OrderbookDEX.connect();
                });

                afterEach(async function() {
                    OrderbookDEX.disconnect();
                });

                it('should not fail', function() {
                    OrderbookDEX.instance;
                });
            });
        });
    });

    describe('instance', function() {
        describe('functions that do not require blockchain account', function() {
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

            describe('getOrderbooks', function() {
                it('should return all the orderbooks', async function() {
                    const orderbooks: Orderbook[] = [];
                    for await (const orderbook of OrderbookDEX.instance.getOrderbooks({})) {
                        orderbooks.push(orderbook);
                    }
                    expect(orderbooks.map(({ address }) => address))
                        .to.have.members(Object.values(testContracts.orderbooks).map(({ address }) => address));
                    for (const orderbook of orderbooks) {
                        const contract = IOrderbookV1.at(orderbook.address);
                        expect(orderbook.version)
                            .to.be.equal(await contract.version());
                        expect(orderbook.tradedToken.address)
                            .to.be.equal(await contract.tradedToken());
                        expect(orderbook.baseToken.address)
                            .to.be.equal(await contract.baseToken());
                        expect(orderbook.contractSize)
                            .to.be.equal(await contract.contractSize());
                        expect(orderbook.priceTick)
                            .to.be.equal(await contract.priceTick());
                    }
                });
            });

            describe('trackOrderbook', function() {
                // TODO
            });

            describe('forgetOrderbook', function() {
                // TODO
            });

            describe('getTokens', function() {
                it('should return tracked tokens', async function() {
                    const tokens = [];
                    for await (const { address, name, symbol, decimals } of OrderbookDEX.instance.getTokens()) {
                        tokens.push({ address, name, symbol, decimals });
                    }
                    expect(tokens.map(({ address }) => address))
                        .to.have.members(devnetConfig.tokens);
                    for (const token of tokens) {
                        const contract = IERC20.at(token.address);
                        expect(token.name)
                            .to.be.equal(await contract.name());
                        expect(token.symbol)
                            .to.be.equal(await contract.symbol());
                        expect(token.decimals)
                            .to.be.equal(await contract.decimals());
                    }
                });
            });

            describe('trackToken', function() {
                // TODO
            });

            describe('forgetToken', function() {
                // TODO
            });
        });

        describe('functions that require blockchain account', function() {
            beforeEach(async function() {
                await setUpEthereumProvider(true);
                await Chain.connect();
                await setUpSmartContracts();
                await OrderbookDEX.connect();
                await giveMeFunds();
            });

            afterEach(async function() {
                OrderbookDEX.disconnect();
                Chain.disconnect();
                await tearDownEthereumProvider();
                resetIndexedDB();
            });

            describe('createOrderbook', function() {
                it('should work', async function() {
                    const { tokens: { WBTC, USDT } } = testContracts;
                    const orderbook = await OrderbookDEX.instance.createOrderbook({
                        tradedToken: await OrderbookDEX.instance.getToken(WBTC),
                        baseToken: await OrderbookDEX.instance.getToken(USDT),
                        contractSize: 1000000000000000n,
                        priceTick: 100000000n,
                    });
                    expect(orderbook.tradedToken.address)
                        .to.be.equal(WBTC);
                    expect(orderbook.baseToken.address)
                        .to.be.equal(USDT);
                    expect(orderbook.contractSize)
                        .to.be.equal(1000000000000000n);
                    expect(orderbook.priceTick)
                        .to.be.equal(100000000n);
                });
            });
        });
    });
});
