import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Chain, Orderbook, OrderbookDEX, Token, UserData, Wallet } from '../src';
import { Cache } from '../src/Cache';
import { ChainInternal } from '../src/Chain';
import { OrderbookDEXInternal } from '../src/OrderbookDEX';
import { UserDataInternal } from '../src/UserData';
import { WalletInternal } from '../src/Wallet';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts } from './smart-contracts';
import { asyncFirst } from './utils';

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
        WalletInternal.disconnect();
        UserDataInternal.unload();
        OrderbookDEXInternal.disconnect();
        ChainInternal.disconnect();
        await tearDownEthereumProvider();
        resetIndexedDB();
        Cache.reset();
    });

    describe('register', function() {
        it('should register', async function() {
            await Wallet.register();
        });
    });

    describe('connect', function() {
        beforeEach(async function() {
            await Wallet.register();
            WalletInternal.disconnect();
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
    })
});
