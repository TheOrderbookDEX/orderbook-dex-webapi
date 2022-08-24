import { Transaction } from '@theorderbookdex/abi2ts-lib';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Chain, Order, Orderbook, OrderbookDEX, Token, UserData, Wallet, WalletEventType } from '../src';
import { Cache } from '../src/Cache';
import { WalletInternal } from '../src/Wallet';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts } from './smart-contracts';
import { increaseTime, setUpTimeMock, tearDownTimeMock } from './time-mock';
import { asyncFirst, asyncToArray } from './utils';

use(chaiAsPromised);

describe('Wallet', function() {
    beforeEach(async function() {
        await setUpEthereumProvider(true);
        await Chain.connect();
        await setUpSmartContracts();
        await OrderbookDEX.connect();
        await UserData.load();
    });

    afterEach(async function() {
        Wallet.disconnect();
        UserData.unload();
        OrderbookDEX.disconnect();
        Chain.disconnect();
        await tearDownEthereumProvider();
        resetIndexedDB();
    });

    describe('register', function() {
        it('should register', async function() {
            await Wallet.register();
        });
    });

    describe('connect', function() {
        beforeEach(async function() {
            await Wallet.register();
            Wallet.disconnect();
        });

        it('should connect', async function() {
            await Wallet.connect();
        });
    });

    describe('wallet operations', function() {
        beforeEach(async function() {
            await Wallet.register();
        });

        // TODO thoroughly test wallet operations

        describe('deposit', function() {
            it('should work', async function() {
                const token = await asyncFirst(UserData.instance.trackedTokens()) as Token;
                await Wallet.instance.deposit(token, 1n);
            });
        });

        describe('withdraw', function() {
            beforeEach(async function() {
                const token = await asyncFirst(UserData.instance.trackedTokens()) as Token;
                await Wallet.instance.deposit(token, 1n);
            });

            it('should work', async function() {
                const token = await asyncFirst(UserData.instance.trackedTokens()) as Token;
                await Wallet.instance.withdraw(token, 1n);
            });
        });
    });

    describe('trade operations', function() {
        beforeEach(async function() {
            await Wallet.register();
            const orderbook = await asyncFirst(UserData.instance.savedOrderbooks()) as Orderbook;
            await Wallet.instance.deposit(orderbook.tradedToken, orderbook.contractSize);
            await Wallet.instance.deposit(orderbook.baseToken, orderbook.priceTick);
        });

        // TODO thoroughly test trade operations

        describe('buyAtMarket', function() {
            it('should work', async function() {
                const orderbook = await asyncFirst(UserData.instance.savedOrderbooks()) as Orderbook;
                await Wallet.instance.buyAtMarket(orderbook, 1n, orderbook.priceTick);
            });
        });

        describe('sellAtMarket', function() {
            it('should work', async function() {
                const orderbook = await asyncFirst(UserData.instance.savedOrderbooks()) as Orderbook;
                await Wallet.instance.sellAtMarket(orderbook, 1n, orderbook.priceTick);
            });
        });

        describe('placeBuyOrder', function() {
            it('should work', async function() {
                const orderbook = await asyncFirst(UserData.instance.savedOrderbooks()) as Orderbook;
                await Wallet.instance.placeBuyOrder(orderbook, 1n, orderbook.priceTick);
            });
        });

        describe('placeSellOrder', function() {
            it('should work', async function() {
                const orderbook = await asyncFirst(UserData.instance.savedOrderbooks()) as Orderbook;
                await Wallet.instance.placeSellOrder(orderbook, 1n, orderbook.priceTick);
            });
        });
    });

    describe('order operations', function() {
        beforeEach(async function() {
            await Wallet.register();
            setUpTimeMock();
        });

        afterEach(function() {
            tearDownTimeMock();
        });

        // TODO thoroughly test all order operations

        describe('dismissOrder', function() {
            beforeEach(async function() {
                const orderbook = await asyncFirst(UserData.instance.savedOrderbooks()) as Orderbook;
                await Wallet.instance.deposit(orderbook.tradedToken, orderbook.contractSize);
                await Wallet.instance.deposit(orderbook.baseToken, orderbook.priceTick);
                await Wallet.instance.placeSellOrder(orderbook, 1n, orderbook.priceTick);
                await waitForOrdersPendingTransactions();
                increaseTime(1);
                await Wallet.instance.buyAtMarket(orderbook, 1n, orderbook.priceTick);
                await waitForOrdersPendingTransactions();
            });

            it('should remove the order', async function() {
                const order = await asyncFirst(Wallet.instance.orders()) as Order;
                await Wallet.instance.dismissOrder(order);
                expect((await asyncToArray(Wallet.instance.orders())).find(({ key }) => key == order.key))
                    .to.be.undefined;
            });

            it('should dispatch an OrderRemovedEvent', async function() {
                let removedOrder: Order | undefined;
                Wallet.instance.addEventListener(WalletEventType.ORDER_REMOVED, ({ order }) => removedOrder = order);
                const order = await asyncFirst(Wallet.instance.orders()) as Order;
                await Wallet.instance.dismissOrder(order);
                expect(removedOrder?.key)
                    .to.be.equal(order.key);
            });
        });
    });
});

async function waitForOrdersPendingTransactions() {
    const pending: Promise<Transaction>[] = [];
    for (const order of await Cache.instance.getOpenOrders(WalletInternal.instance._operator)) {
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
