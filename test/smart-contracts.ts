import { AddressBook } from '@frugal-wizard/addressbook/dist/AddressBook';
import { OperatorFactory } from '@theorderbookdex/orderbook-dex-operator/dist/OperatorFactory';
import { OrderbookFactoryV1 } from '@theorderbookdex/orderbook-dex-v1/dist/OrderbookFactoryV1';
import { IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { createSigner, getAccounts, getBalance, getBlockNumber, getBlockTimestamp, hexstring, Signer } from '@frugal-wizard/abi2ts-lib';
import { EthereumProvider } from 'ganache';
import { OperatorV1 } from '@theorderbookdex/orderbook-dex-v1-operator/dist/OperatorV1';
import { Address, ZERO_ADDRESS } from '../src';
import { ERC20WithFaucet } from '@theorderbookdex/orderbook-dex/dist/testing/ERC20WithFaucet';

interface Global {
    ethereum?: EthereumProvider;
}

const global = globalThis as Global;

export type TradedTokenSymbol = 'WBTC' | 'WETH' | 'BNB' | 'WXRP';
export type BaseTokenSymbol = 'USDT';
export type TokenSymbol = TradedTokenSymbol | BaseTokenSymbol;
export type OrderbookPair = `${TradedTokenSymbol}/${BaseTokenSymbol}`;

export interface TestContracts {
    addressBook: Address;
    operatorFactory: Address;
    operatorV1: Address;
    orderbookFactory: Address;
    tokens: Record<TokenSymbol, Address>;
    orderbooks: Record<OrderbookPair, { address: Address, blockNumber: number }>;
}

export const testContracts: TestContracts = {
    addressBook:      ZERO_ADDRESS,
    operatorFactory:  ZERO_ADDRESS,
    operatorV1:       ZERO_ADDRESS,
    orderbookFactory: ZERO_ADDRESS,
    tokens: {
        WBTC: ZERO_ADDRESS,
        WETH: ZERO_ADDRESS,
        BNB:  ZERO_ADDRESS,
        WXRP: ZERO_ADDRESS,
        USDT: ZERO_ADDRESS,
    },
    orderbooks: {
        'WBTC/USDT': { address: ZERO_ADDRESS, blockNumber: 0 },
        'WETH/USDT': { address: ZERO_ADDRESS, blockNumber: 0 },
        'BNB/USDT':  { address: ZERO_ADDRESS, blockNumber: 0 },
        'WXRP/USDT': { address: ZERO_ADDRESS, blockNumber: 0 },
    },
}

const ONE_DAY = 24n * 60n * 60n;

export async function setUpSmartContracts() {
    const signer = await createSigner('0x0000000000000000000000000000000000000000000000000000000000000001');
    await global.ethereum?.send('evm_setAccountBalance', [ signer.address, hexstring(1000000000000000000000n) ]);

    testContracts.addressBook      = (await signer.sendTransaction(await AddressBook.populateTransaction.deploy())).contractAddress as Address;
    testContracts.operatorFactory  = (await signer.sendTransaction(await OperatorFactory.populateTransaction.deploy(signer.address, testContracts.addressBook))).contractAddress as Address;
    testContracts.operatorV1       = (await signer.sendTransaction(await OperatorV1.populateTransaction.deploy())).contractAddress as Address;
    testContracts.orderbookFactory = (await signer.sendTransaction(await OrderbookFactoryV1.populateTransaction.deploy(testContracts.addressBook))).contractAddress as Address;

    testContracts.tokens.WBTC = (await signer.sendTransaction(await ERC20WithFaucet.populateTransaction.deploy('Wrapped BTC',   'WBTC', 18,    1000000000000000000000n, ONE_DAY))).contractAddress as Address;
    testContracts.tokens.WETH = (await signer.sendTransaction(await ERC20WithFaucet.populateTransaction.deploy('Wrapped Ether', 'WETH', 18,   10000000000000000000000n, ONE_DAY))).contractAddress as Address;
    testContracts.tokens.BNB  = (await signer.sendTransaction(await ERC20WithFaucet.populateTransaction.deploy('BNB',           'BNB',  18,  100000000000000000000000n, ONE_DAY))).contractAddress as Address;
    testContracts.tokens.WXRP = (await signer.sendTransaction(await ERC20WithFaucet.populateTransaction.deploy('Wrapped XRP',   'WXRP', 18, 1000000000000000000000000n, ONE_DAY))).contractAddress as Address;
    testContracts.tokens.USDT = (await signer.sendTransaction(await ERC20WithFaucet.populateTransaction.deploy('Tether USD',    'USDT',  6,             1000000000000n, ONE_DAY))).contractAddress as Address;

    await setUpOrderbook(signer, 'WBTC/USDT', 1000000000000000n, 100000000n);
    await setUpOrderbook(signer, 'WETH/USDT', 10000000000000000n, 10000000n);
    await setUpOrderbook(signer, 'BNB/USDT',  100000000000000000n, 1000000n);
    await setUpOrderbook(signer, 'WXRP/USDT', 1000000000000000000n,  10000n);

    await signer.sendTransaction(await OperatorFactory.at(testContracts.operatorFactory).populateTransaction.registerVersion(10000n, testContracts.operatorV1));
}

async function setUpOrderbook(signer: Signer, pair: OrderbookPair, contractSize: bigint, priceTick: bigint) {
    const { orderbookFactory, tokens } = testContracts;
    const [ tradedToken, baseToken ] = (pair.split('/') as TokenSymbol[]).map(symbol => tokens[symbol]);
    const address = await OrderbookFactoryV1.at(orderbookFactory).callStatic.createOrderbook(tradedToken, baseToken, contractSize, priceTick, { from: signer.address }) as Address;
    await signer.sendTransaction(await OrderbookFactoryV1.at(orderbookFactory).populateTransaction.createOrderbook(tradedToken, baseToken, contractSize, priceTick));
    const blockNumber = await getBlockNumber();
    testContracts.orderbooks[pair] = { address, blockNumber };
}

export async function createAuxSigner() {
    const signer = await createSigner('0x0000000000000000000000000000000000000000000000000000000000000003');
    if (!await getBalance(signer.address)) {
        await global.ethereum?.send('evm_setAccountBalance', [ signer.address, hexstring(1000000000000000000000n) ]);

        const { addressBook, tokens: { WBTC, WETH, BNB, WXRP, USDT} } = testContracts;
        await signer.sendTransaction(await ERC20WithFaucet.at(WBTC).populateTransaction.faucet());
        await signer.sendTransaction(await ERC20WithFaucet.at(WETH).populateTransaction.faucet());
        await signer.sendTransaction(await ERC20WithFaucet.at(BNB ).populateTransaction.faucet());
        await signer.sendTransaction(await ERC20WithFaucet.at(WXRP).populateTransaction.faucet());
        await signer.sendTransaction(await ERC20WithFaucet.at(USDT).populateTransaction.faucet());

        await signer.sendTransaction(await AddressBook.at(addressBook).populateTransaction.register());
    }
    return signer;
}

interface Order {
    orderType: 0 | 1;
    price: bigint;
    amount: bigint;
}

const MAX_UINT256 = 2n ** 256n - 1n;

async function approveOrderbook(signer: Signer, orderbook: IOrderbookV1) {
    const tradedToken = IERC20.at(await orderbook.tradedToken());
    const baseToken = IERC20.at(await orderbook.baseToken());
    if (!await tradedToken.allowance(signer, orderbook)) {
        await signer.sendTransaction(await tradedToken.populateTransaction.approve(orderbook, MAX_UINT256));
    }
    if (!await baseToken.allowance(signer, orderbook)) {
        await signer.sendTransaction(await baseToken.populateTransaction.approve(orderbook, MAX_UINT256));
    }
}

export async function placeOrders(address: string, orders: Order[]) {
    const signer = await createAuxSigner();
    const orderbook = IOrderbookV1.at(address);
    await approveOrderbook(signer, orderbook);
    const priceTick = await orderbook.priceTick();
    for (const { orderType, price, amount } of orders) {
        await signer.sendTransaction(await orderbook.populateTransaction.placeOrder(orderType, price * priceTick, amount));
    }
}

export async function fillOrders(address: string, orderType: 0 | 1, amount: bigint) {
    const signer = await createAuxSigner();
    const orderbook = IOrderbookV1.at(address);
    await approveOrderbook(signer, orderbook);
    await signer.sendTransaction(await orderbook.populateTransaction.fill(orderType, amount, orderType ? 0n : MAX_UINT256, 255));
}

interface PricePoints {
    sell: Map<bigint, bigint>;
    buy: Map<bigint, bigint>;
}

export async function simulatePricePoints(address: string, pricePoints: PricePoints) {
    await placeOrders(address, [
        ...[...pricePoints.sell.entries()].map(([ price, amount ]) => ({
            orderType: 0,
            price,
            amount,
        } as Order)),
        ...[...pricePoints.buy.entries()].map(([ price, amount ]) => ({
            orderType: 1,
            price,
            amount,
        } as Order)),
    ]);
}

interface Candle {
    open: bigint;
    high: bigint;
    low: bigint;
    close: bigint;
}

export async function fastForwardToNextBar(timeFrame: number) {
    const timestamp = await getBlockTimestamp();
    await global.ethereum?.send('evm_increaseTime', [ timeFrame - timestamp % timeFrame ]);
}

export async function simulatePriceHistory(address: string, timeFrame: number, candles: Candle[]) {
    const signer = await createAuxSigner();
    const orderbook = IOrderbookV1.at(address);
    await approveOrderbook(signer, orderbook);
    const priceTick = await orderbook.priceTick();
    for (const candle of candles) {
        await fastForwardToNextBar(timeFrame);
        await signer.sendTransaction(await orderbook.populateTransaction.placeOrder(0, candle.open * priceTick, 1n));
        await signer.sendTransaction(await orderbook.populateTransaction.fill(0, 1n, MAX_UINT256, 255));
        await signer.sendTransaction(await orderbook.populateTransaction.placeOrder(0, candle.high * priceTick, 1n));
        await signer.sendTransaction(await orderbook.populateTransaction.fill(0, 1n, MAX_UINT256, 255));
        await signer.sendTransaction(await orderbook.populateTransaction.placeOrder(0, candle.low * priceTick, 1n));
        await signer.sendTransaction(await orderbook.populateTransaction.fill(0, 1n, MAX_UINT256, 255));
        await signer.sendTransaction(await orderbook.populateTransaction.placeOrder(0, candle.close * priceTick, 1n));
        await signer.sendTransaction(await orderbook.populateTransaction.fill(0, 1n, MAX_UINT256, 255));
    }
}

export async function simulateTicks(address: string, prices: bigint[], timeFrame?: number) {
    const signer = await createAuxSigner();
    const orderbook = IOrderbookV1.at(address);
    await approveOrderbook(signer, orderbook);
    const priceTick = await orderbook.priceTick();
    for (const price of prices) {
        if (timeFrame) await fastForwardToNextBar(timeFrame);
        await signer.sendTransaction(await orderbook.populateTransaction.placeOrder(0, price * priceTick, 1n));
        await signer.sendTransaction(await orderbook.populateTransaction.fill(0, 1n, MAX_UINT256, 255));
    }
}

export async function giveMeFunds() {
    const [ address ] = await getAccounts();
    await global.ethereum?.send('evm_setAccountBalance', [ address, hexstring(1000000000000000000000n) ]);

    const { tokens: { WBTC, WETH, BNB, WXRP, USDT} } = testContracts;
    await ERC20WithFaucet.at(WBTC).faucet();
    await ERC20WithFaucet.at(WETH).faucet();
    await ERC20WithFaucet.at(BNB ).faucet();
    await ERC20WithFaucet.at(WXRP).faucet();
    await ERC20WithFaucet.at(USDT).faucet();
}
