import { AddressBook } from '@frugal-wizard/addressbook/dist/AddressBook';
import { ERC20Mock } from '@theorderbookdex/orderbook-dex/dist/testing/ERC20Mock';
import { OperatorLogicRegistry } from '@theorderbookdex/orderbook-dex-operator/dist/OperatorLogicRegistry';
import { OperatorFactory } from '@theorderbookdex/orderbook-dex-operator/dist/OperatorFactory';
import { OperatorLogicV1 } from '@theorderbookdex/orderbook-dex-v1/dist/OperatorLogicV1';
import { OrderbookFactoryV1 } from '@theorderbookdex/orderbook-dex-v1/dist/OrderbookFactoryV1';
import { IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { createSigner, getAccounts, getBalance, getBlockTimestamp, hexstring, Signer } from '@frugal-wizard/abi2ts-lib';
import { EthereumProvider } from 'ganache';

interface Global {
    ethereum?: EthereumProvider;
}

const global = globalThis as Global;

export async function setUpSmartContracts() {
    const signer = await createSigner('0x0000000000000000000000000000000000000000000000000000000000000001');
    await global.ethereum?.send('evm_setAccountBalance', [ signer.address, hexstring(1000000000000000000000n) ]);
    const addressBook      = (await signer.sendTransaction(await AddressBook.populateTransaction.deploy())).contractAddress;
    const logicRegistry    = (await signer.sendTransaction(await OperatorLogicRegistry.populateTransaction.deploy())).contractAddress;
                             (await signer.sendTransaction(await OperatorFactory.populateTransaction.deploy(logicRegistry, addressBook))).contractAddress;
    const operatorLogic    = (await signer.sendTransaction(await OperatorLogicV1.populateTransaction.deploy())).contractAddress;
    const orderbookFactory = (await signer.sendTransaction(await OrderbookFactoryV1.populateTransaction.deploy(addressBook))).contractAddress;
    const WBTC             = (await signer.sendTransaction(await ERC20Mock.populateTransaction.deploy('Wrapped BTC', 'WBTC', 18))).contractAddress;
    const WETH             = (await signer.sendTransaction(await ERC20Mock.populateTransaction.deploy('Wrapped Ether', 'WETH', 18))).contractAddress;
    const BNB              = (await signer.sendTransaction(await ERC20Mock.populateTransaction.deploy('BNB', 'BNB', 18))).contractAddress;
    const WXRP             = (await signer.sendTransaction(await ERC20Mock.populateTransaction.deploy('Wrapped XRP', 'WXRP', 18))).contractAddress;
    const USDT             = (await signer.sendTransaction(await ERC20Mock.populateTransaction.deploy('Tether USD', 'USDT', 6))).contractAddress;
    await signer.sendTransaction(await OrderbookFactoryV1.at(orderbookFactory).populateTransaction.createOrderbook(WBTC, USDT, 1000000000000000n, 100000000n));
    await signer.sendTransaction(await OrderbookFactoryV1.at(orderbookFactory).populateTransaction.createOrderbook(WETH, USDT, 10000000000000000n, 10000000n));
    await signer.sendTransaction(await OrderbookFactoryV1.at(orderbookFactory).populateTransaction.createOrderbook(BNB,  USDT, 100000000000000000n, 1000000n));
    await signer.sendTransaction(await OrderbookFactoryV1.at(orderbookFactory).populateTransaction.createOrderbook(WXRP, USDT, 1000000000000000000n,  10000n));
    await signer.sendTransaction(await OperatorLogicRegistry.at(logicRegistry).populateTransaction.register(10000n, operatorLogic));
}

export async function createAuxSigner() {
    const signer = await createSigner('0x0000000000000000000000000000000000000000000000000000000000000003');
    if (!await getBalance(signer.address)) {
        await global.ethereum?.send('evm_setAccountBalance', [ signer.address, hexstring(1000000000000000000000n) ]);
        await signer.sendTransaction(await ERC20Mock.at('0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1').populateTransaction.giveMe(1000000000000000000000n));
        await signer.sendTransaction(await ERC20Mock.at('0x5CF7F96627F3C9903763d128A1cc5D97556A6b99').populateTransaction.giveMe(1000000000000000000000n));
        await signer.sendTransaction(await ERC20Mock.at('0xA3183498b579bd228aa2B62101C40CC1da978F24').populateTransaction.giveMe(1000000000000000000000n));
        await signer.sendTransaction(await ERC20Mock.at('0x63f58053c9499E1104a6f6c6d2581d6D83067EEB').populateTransaction.giveMe(1000000000000000000000n));
        await signer.sendTransaction(await ERC20Mock.at('0x66a15edcC3b50a663e72F1457FFd49b9AE284dDc').populateTransaction.giveMe(1000000000000n));
        await signer.sendTransaction(await AddressBook.at('0xF2E246BB76DF876Cef8b38ae84130F4F55De395b').populateTransaction.register());
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
    await ERC20Mock.at('0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1').giveMe(1000000000000000000000n);
    await ERC20Mock.at('0x5CF7F96627F3C9903763d128A1cc5D97556A6b99').giveMe(1000000000000000000000n);
    await ERC20Mock.at('0xA3183498b579bd228aa2B62101C40CC1da978F24').giveMe(1000000000000000000000n);
    await ERC20Mock.at('0x63f58053c9499E1104a6f6c6d2581d6D83067EEB').giveMe(1000000000000000000000n);
    await ERC20Mock.at('0x66a15edcC3b50a663e72F1457FFd49b9AE284dDc').giveMe(1000000000000n);
}
