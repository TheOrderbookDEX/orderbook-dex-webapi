import { formatValue } from '@frugalwizard/abi2ts-lib';
import { IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { IOrderbookDEXTeamTreasury } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbookDEXTeamTreasury';
import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Orderbook, OrderbookDEX, OrderbookDEXNotConnected } from '../src';
import { Chain, ChainNotConnected } from '../src/Chain';
import { devnetConfig } from '../src/OrderbookDEX';
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
                    expect(orderbook.fee)
                        .to.be.equal(await IOrderbookDEXTeamTreasury.at(testContracts.treasury).fee(orderbook.version));
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

        describe('formatFeeAsPercentage', function() {
            for (const { fee, formatted } of [
                { fee:              0n, formatted: '0.0%' },
                { fee:      10n ** 16n, formatted: '1.0%' },
                { fee: 2n * 10n ** 16n, formatted: '2.0%' },
                { fee:      10n ** 15n, formatted: '0.1%' },
                { fee: 2n * 10n ** 15n, formatted: '0.2%' },
            ]) {
                describe(`fee = ${formatValue(fee)}`, function() {
                    it('should return formatted fee percentage', function() {
                        expect(OrderbookDEX.instance.formatFeeAsPercentage(fee))
                            .to.be.equal(formatted);
                    });
                });
            }
        });

        describe('applyFee', function() {
            for (const { amount, fee, feeAmount } of [
                { amount:      10n ** 18n, fee:              0n, feeAmount:              0n },
                { amount:      10n ** 18n, fee:      10n ** 15n, feeAmount:      10n ** 15n },
                { amount: 2n * 10n ** 18n, fee:      10n ** 15n, feeAmount: 2n * 10n ** 15n },
                { amount:      10n ** 18n, fee: 2n * 10n ** 15n, feeAmount: 2n * 10n ** 15n },
                { amount: 2n * 10n ** 18n, fee: 2n * 10n ** 15n, feeAmount: 4n * 10n ** 15n },
            ]) {
                describe(`amount = ${formatValue(amount)} and fee = ${formatValue(fee)}`, function() {
                    it('should return fee amount', function() {
                        expect(OrderbookDEX.instance.applyFee(amount, fee))
                            .to.be.equal(feeAmount);
                    });
                });
            }
        });
    });
});
