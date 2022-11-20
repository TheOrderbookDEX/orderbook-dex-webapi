import { IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Orderbook, OrderbookDEX, OrderbookDEXNotConnected } from '../src';
import { Chain, ChainNotConnected } from '../src/Chain';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts, testContracts } from './smart-contracts';

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
            beforeEach(async function() {
                for (const address of Object.values(testContracts.tokens)) {
                    const token = await OrderbookDEX.instance.getToken(address);
                    await OrderbookDEX.instance.trackToken(token);
                }
            });

            it('should return tracked tokens', async function() {
                const tokens = [];
                for await (const { address, name, symbol, decimals } of OrderbookDEX.instance.getTokens()) {
                    tokens.push({ address, name, symbol, decimals });
                }
                expect(tokens.map(({ address }) => address))
                    .to.have.members(Object.values(testContracts.tokens));
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
});
