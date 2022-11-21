import { Transaction } from '@frugal-wizard/abi2ts-lib';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Chain, Order, OrderbookDEX, Operator, OperatorEventType } from '../src';
import { Database } from '../src/Database';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { giveMeFunds, setUpSmartContracts, testContracts } from './smart-contracts';
import { increaseTime, setUpTimeMock, tearDownTimeMock } from './time-mock';
import { asyncFirst, asyncToArray } from './utils';

use(chaiAsPromised);

describe('Operator', function() {
    beforeEach(async function() {
        await setUpEthereumProvider(true);
        await Chain.connect();
        await setUpSmartContracts();
        await OrderbookDEX.connect();
    });

    afterEach(async function() {
        Operator.disconnect();
        OrderbookDEX.disconnect();
        Chain.disconnect();
        await tearDownEthereumProvider();
        resetIndexedDB();
    });

    describe('create', function() {
        it('should create', async function() {
            await Operator.create();
        });
    });

    describe('connect', function() {
        beforeEach(async function() {
            await Operator.create();
            Operator.disconnect();
        });

        it('should connect', async function() {
            await Operator.connect();
        });
    });

    describe('wallet operations', function() {
        beforeEach(async function() {
            await Operator.create();
            await giveMeFunds();
        });

        // TODO thoroughly test wallet operations

        describe('deposit', function() {
            it('should work', async function() {
                const token = await OrderbookDEX.instance.getToken(Object.values(testContracts.tokens)[0]);
                await Operator.instance.deposit(token, 1n);
            });
        });

        describe('withdraw', function() {
            beforeEach(async function() {
                const token = await OrderbookDEX.instance.getToken(Object.values(testContracts.tokens)[0]);
                await Operator.instance.deposit(token, 1n);
            });

            it('should work', async function() {
                const token = await OrderbookDEX.instance.getToken(Object.values(testContracts.tokens)[0]);
                await Operator.instance.withdraw(token, 1n);
            });
        });
    });

    describe('trade operations', function() {
        beforeEach(async function() {
            await Operator.create();
            await giveMeFunds();
            const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
            await Operator.instance.deposit(orderbook.tradedToken, orderbook.contractSize);
            await Operator.instance.deposit(orderbook.baseToken, orderbook.priceTick);
        });

        // TODO thoroughly test trade operations

        describe('buyAtMarket', function() {
            it('should work', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await Operator.instance.buyAtMarket(orderbook, 1n, orderbook.priceTick);
            });
        });

        describe('sellAtMarket', function() {
            it('should work', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await Operator.instance.sellAtMarket(orderbook, 1n, orderbook.priceTick);
            });
        });

        describe('placeBuyOrder', function() {
            it('should work', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await Operator.instance.placeBuyOrder(orderbook, 1n, orderbook.priceTick);
            });
        });

        describe('placeSellOrder', function() {
            it('should work', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await Operator.instance.placeSellOrder(orderbook, 1n, orderbook.priceTick);
            });
        });
    });

    describe('order operations', function() {
        beforeEach(async function() {
            await Operator.create();
            await giveMeFunds();
            setUpTimeMock();
        });

        afterEach(function() {
            tearDownTimeMock();
        });

        // TODO thoroughly test all order operations

        describe('dismissOrder', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await Operator.instance.deposit(orderbook.tradedToken, orderbook.contractSize);
                await Operator.instance.deposit(orderbook.baseToken, orderbook.priceTick);
                await Operator.instance.placeSellOrder(orderbook, 1n, orderbook.priceTick);
                await waitForOrdersPendingTransactions();
                increaseTime(1);
                await Operator.instance.buyAtMarket(orderbook, 1n, orderbook.priceTick);
                await waitForOrdersPendingTransactions();
            });

            it('should remove the order', async function() {
                const order = await asyncFirst(Operator.instance.orders()) as Order;
                await Operator.instance.dismissOrder(order);
                expect((await asyncToArray(Operator.instance.orders())).find(({ key }) => key == order.key))
                    .to.be.undefined;
            });

            it('should dispatch an OrderRemovedEvent', async function() {
                let removedOrder: Order | undefined;
                Operator.instance.addEventListener(OperatorEventType.ORDER_REMOVED, ({ order }) => removedOrder = order);
                const order = await asyncFirst(Operator.instance.orders()) as Order;
                await Operator.instance.dismissOrder(order);
                expect(removedOrder?.key)
                    .to.be.equal(order.key);
            });
        });
    });
});

async function waitForOrdersPendingTransactions() {
    const pending: Promise<Transaction>[] = [];
    for (const order of await Database.instance.getOpenOrders(Operator.instance.operatorAddress)) {
        if (order.txHash) {
            pending.push(Transaction.get(order.txHash));
        }
        if (order.claimTxHash) {
            pending.push(Transaction.get(order.claimTxHash));
        }
        if (order.cancelTxHash) {
            pending.push(Transaction.get(order.cancelTxHash));
        }
    }
    await Promise.all(pending);
}
