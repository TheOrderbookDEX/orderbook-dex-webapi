import { getBlockTimestamp } from '@frugalwizard/abi2ts-lib';
import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { OrderbookDEX, OrderType, PricePointAddedEvent, PricePointRemovedEvent, PricePointsEventType, PricePointUpdatedEvent, TimeFrame } from '../src';
import { Chain } from '../src/Chain';
import { ChainEvents } from '../src/ChainEvents';
import { PriceChangedEvent, PriceTickerEventType, PriceTickerInternal } from '../src/PriceTicker';
import { now } from '../src/time';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { fillOrders, placeOrders, setUpSmartContracts, simulatePriceHistory, simulatePricePoints, simulateTicks, testContracts } from './smart-contracts';
import { setTime, setUpTimeMock, tearDownTimeMock } from './time-mock';

use(chaiAsPromised);

const testPricePoints: Parameters<typeof simulatePricePoints>[1] = {
    sell: new Map([
        [ 100n, 10n ],
        [ 102n, 5n ],
        [ 104n, 3n ],
        [ 106n, 2n ],
        [ 108n, 2n ],
        [ 110n, 2n ],
        [ 112n, 2n ],
        [ 114n, 2n ],
        [ 116n, 2n ],
        [ 118n, 2n ],
        [ 120n, 2n ],
        [ 122n, 2n ],
        [ 124n, 2n ],
    ]),
    buy: new Map([
        [ 98n, 8n ],
        [ 96n, 4n ],
        [ 94n, 2n ],
        [ 92n, 1n ],
        [ 90n, 1n ],
        [ 88n, 1n ],
        [ 86n, 1n ],
        [ 84n, 1n ],
        [ 82n, 1n ],
        [ 80n, 1n ],
        [ 78n, 1n ],
        [ 76n, 1n ],
        [ 74n, 1n ],
    ]),
};

const testPriceHistory: Parameters<typeof simulatePriceHistory>[2] = [
    { open: 100n, high: 102n, low: 99n, close: 101n },
    { open: 80n, high: 83n, low: 75n, close: 78n },
];

const testTicks = [ 81n, 99n, 109n, 101n, 100n, 83n, 84n, 118n, 94n, 97n ];

describe('Orderbook', function() {
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

    describe('getPricePoints', function() {
        beforeEach(async function() {
            const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
            await simulatePricePoints(orderbook.address, testPricePoints);
            await ChainEvents.instance.forceUpdate();
        });

        describe('not limiting results', function() {
            describe('the returned object', function() {
                it('should provide all the current price points', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    expect(pricePoints.sell.map(({ price, available }) => ({ price, available })))
                        .to.be.deep.equal(
                            [...testPricePoints.sell.entries()]
                                .map(([ price, available ]) => ({
                                    price: price * orderbook.priceTick,
                                    available
                                }))
                        );
                    expect(pricePoints.buy.map(({ price, available }) => ({ price, available })))
                        .to.be.deep.equal(
                            [...testPricePoints.buy.entries()]
                                .map(([ price, available ]) => ({
                                    price: price * orderbook.priceTick,
                                    available
                                }))
                        );
                });
            });

            describe('after adding a sell price point', function() {
                it('should emit a PricePointAddedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    const abortController = new AbortController();
                    let event: PricePointAddedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_ADDED, e => event = e, { signal: abortController.signal });
                    try {
                        const price = [...testPricePoints.sell.keys()][0] + 1n;
                        await placeOrders(orderbook.address, [{ orderType: 0, price, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(price * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(1n);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after adding a buy price point', function() {
                it('should emit a PricePointAddedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    const abortController = new AbortController();
                    let event: PricePointAddedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_ADDED, e => event = e, { signal: abortController.signal });
                    try {
                        const price = [...testPricePoints.buy.keys()][0] - 1n;
                        await placeOrders(orderbook.address, [{ orderType: 1, price, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(price * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(1n);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after updating a sell price point', function() {
                it('should emit a PricePointUpdatedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    const abortController = new AbortController();
                    let event: PricePointUpdatedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_UPDATED, e => event = e, { signal: abortController.signal });
                    try {
                        const [[ price, available ]] = [...testPricePoints.sell.entries()];
                        await placeOrders(orderbook.address, [{ orderType: 0, price, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(price * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(available + 1n);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after updating a buy price point', function() {
                it('should emit a PricePointUpdatedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    const abortController = new AbortController();
                    let event: PricePointUpdatedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_UPDATED, e => event = e, { signal: abortController.signal });
                    try {
                        const [[ price, available ]] = [...testPricePoints.buy.entries()];
                        await placeOrders(orderbook.address, [{ orderType: 1, price, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(price * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(available + 1n);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after removing a sell price point', function() {
                it('should emit a PricePointRemovedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    const abortController = new AbortController();
                    let event: PricePointRemovedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_REMOVED, e => event = e, { signal: abortController.signal });
                    try {
                        const [ [ removedPrice, amountToFill ] ] = [...testPricePoints.sell.entries()];
                        await fillOrders(orderbook.address, 0, amountToFill);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(removedPrice * orderbook.priceTick);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after removing a buy price point', function() {
                it('should emit a PricePointRemovedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(Infinity);
                    const abortController = new AbortController();
                    let event: PricePointRemovedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_REMOVED, e => event = e, { signal: abortController.signal });
                    try {
                        const [ [ removedPrice, amountToFill ] ] = [...testPricePoints.buy.entries()];
                        await fillOrders(orderbook.address, 1, amountToFill);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(removedPrice * orderbook.priceTick);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });
        });

        describe('limiting results', function() {
            describe('the returned object', function() {
                it('should provide the current price points capped at limit', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    expect(pricePoints.sell.map(({ price, available }) => ({ price, available })))
                        .to.be.deep.equal(
                            [...testPricePoints.sell.entries()].slice(0, 2)
                                .map(([ price, available ]) => ({
                                    price: price * orderbook.priceTick,
                                    available
                                }))
                        );
                    expect(pricePoints.buy.map(({ price, available }) => ({ price, available })))
                        .to.be.deep.equal(
                            [...testPricePoints.buy.entries()].slice(0, 2)
                                .map(([ price, available ]) => ({
                                    price: price * orderbook.priceTick,
                                    available
                                }))
                        );
                });
            });

            describe('after adding a sell price point', function() {
                it('should emit a PricePointAddedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointAddedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_ADDED, e => event = e, { signal: abortController.signal });
                    try {
                        const price = [...testPricePoints.sell.keys()][0] + 1n;
                        await placeOrders(orderbook.address, [{ orderType: 0, price, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(price * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(1n);
                        }
                    } finally {
                        abortController.abort();
                    }
                });

                it('should emit a PricePointRemovedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointRemovedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_REMOVED, e => event = e, { signal: abortController.signal });
                    try {
                        const prices = [...testPricePoints.sell.keys()];
                        await placeOrders(orderbook.address, [{ orderType: 0, price: prices[0] + 1n, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(prices[1] * orderbook.priceTick);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after adding a buy price point', function() {
                it('should emit a PricePointAddedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointAddedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_ADDED, e => event = e, { signal: abortController.signal });
                    try {
                        const price = [...testPricePoints.buy.keys()][0] - 1n;
                        await placeOrders(orderbook.address, [{ orderType: 1, price, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(price * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(1n);
                        }
                    } finally {
                        abortController.abort();
                    }
                });

                it('should emit a PricePointRemovedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointRemovedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_REMOVED, e => event = e, { signal: abortController.signal });
                    try {
                        const prices = [...testPricePoints.buy.keys()];
                        await placeOrders(orderbook.address, [{ orderType: 1, price: prices[0] - 1n, amount: 1n }]);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(prices[1] * orderbook.priceTick);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after removing a sell price point', function() {
                it('should emit a PricePointRemovedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointRemovedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_REMOVED, e => event = e, { signal: abortController.signal });
                    try {
                        const [ [ removedPrice, amountToFill ] ] = [...testPricePoints.sell.entries()];
                        await fillOrders(orderbook.address, 0, amountToFill);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(removedPrice * orderbook.priceTick);
                        }
                    } finally {
                        abortController.abort();
                    }
                });

                it('should emit a PricePointAddedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointAddedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_ADDED, e => event = e, { signal: abortController.signal });
                    try {
                        const [ [ , amountToFill ], , [ addedPrice, addedAvailable ] ] = [...testPricePoints.sell.entries()];
                        await fillOrders(orderbook.address, 0, amountToFill);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.SELL);
                            expect(event.price)
                                .to.be.equal(addedPrice * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(addedAvailable);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });

            describe('after removing a buy price point', function() {
                it('should emit a PricePointRemovedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointRemovedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_REMOVED, e => event = e, { signal: abortController.signal });
                    try {
                        const [ [ removedPrice, amountToFill ] ] = [...testPricePoints.buy.entries()];
                        await fillOrders(orderbook.address, 1, amountToFill);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(removedPrice * orderbook.priceTick);
                        }
                    } finally {
                        abortController.abort();
                    }
                });

                it('should emit a PricePointAddedEvent', async function() {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const pricePoints = await orderbook.getPricePoints(2);
                    const abortController = new AbortController();
                    let event: PricePointAddedEvent | undefined;
                    pricePoints.addEventListener(PricePointsEventType.PRICE_POINT_ADDED, e => event = e, { signal: abortController.signal });
                    try {
                        const [ [ , amountToFill ], , [ addedPrice, addedAvailable ] ] = [...testPricePoints.buy.entries()];
                        await fillOrders(orderbook.address, 1, amountToFill);
                        await ChainEvents.instance.forceUpdate();
                        expect(event)
                            .to.exist;
                        if (event) {
                            expect(event.orderType)
                                .to.be.equal(OrderType.BUY);
                            expect(event.price)
                                .to.be.equal(addedPrice * orderbook.priceTick);
                            expect(event.available)
                                .to.be.equal(addedAvailable);
                        }
                    } finally {
                        abortController.abort();
                    }
                });
            });
        });
    });

    describe('getPriceHistory', function() {
        describe('getting for the first time', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await simulatePriceHistory(orderbook.address, TimeFrame.MINUTES_15 as number, testPriceHistory);
            });

            it('should return the current price history', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceHistory = orderbook.getPriceHistory(TimeFrame.MINUTES_15);
                let index = 0;
                for await (const bar of priceHistory) {
                    expect(index)
                        .to.be.lessThan(testPriceHistory.length);
                    const candle = testPriceHistory[testPriceHistory.length - index - 1];
                    expect(bar.open)
                        .to.be.equal(candle.open * orderbook.priceTick);
                    expect(bar.high)
                        .to.be.equal(candle.high * orderbook.priceTick);
                    expect(bar.low)
                        .to.be.equal(candle.low * orderbook.priceTick);
                    expect(bar.close)
                        .to.be.equal(candle.close * orderbook.priceTick);
                    index++;
                }
                expect(index)
                    .to.be.equal(testPriceHistory.length);
            });
        });

        describe('getting for a second time', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await simulatePriceHistory(orderbook.address, TimeFrame.MINUTES_15 as number, testPriceHistory);
                const priceHistory = orderbook.getPriceHistory(TimeFrame.MINUTES_15);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
                for await (const _ of priceHistory) {}
            });

            it('should return the current price history', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceHistory = orderbook.getPriceHistory(TimeFrame.MINUTES_15);
                let index = 0;
                for await (const bar of priceHistory) {
                    expect(index)
                        .to.be.lessThan(testPriceHistory.length);
                    const candle = testPriceHistory[testPriceHistory.length - index - 1];
                    expect(bar.open)
                        .to.be.equal(candle.open * orderbook.priceTick);
                    expect(bar.high)
                        .to.be.equal(candle.high * orderbook.priceTick);
                    expect(bar.low)
                        .to.be.equal(candle.low * orderbook.priceTick);
                    expect(bar.close)
                        .to.be.equal(candle.close * orderbook.priceTick);
                    index++;
                }
                expect(index)
                    .to.be.equal(testPriceHistory.length);
            });
        });
    });

    describe('getPriceTicker', function() {
        beforeEach(async function() {
            setUpTimeMock();
        });

        afterEach(function() {
            tearDownTimeMock();
        });

        describe('with no price ticks', function() {
            it('should provide the expected lastPrice', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.lastPrice)
                    .to.be.undefined;
            });

            it('should provide the expected priceChange', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.priceChange)
                    .to.be.undefined;
            });
        });

        describe('with price ticks all within the same day', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await simulateTicks(orderbook.address, testTicks);
                setTime(await getBlockTimestamp());
            });

            it('should provide the expected lastPrice', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.lastPrice)
                    .to.be.equal(testTicks[testTicks.length - 1] * orderbook.priceTick);
            });

            it('should provide the expected priceChange', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.priceChange)
                    .to.be.undefined;
            });
        });

        describe('with price ticks every 24hs', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await simulateTicks(orderbook.address, testTicks, TimeFrame.DAY as number + 1);
                setTime(await getBlockTimestamp());
            });

            it('should provide the expected lastPrice', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.lastPrice)
                    .to.be.equal(testTicks[testTicks.length - 1] * orderbook.priceTick);
            });

            it('should provide the expected priceChange', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.priceChange)
                    .to.be.equal(Number(testTicks[testTicks.length - 1] * 1000000n / testTicks[testTicks.length - 2]) / 1000000 - 1);
            });
        });

        describe('with price ticks every 12hs', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await simulateTicks(orderbook.address, testTicks, TimeFrame.DAY as number / 2 + 1);
                setTime(await getBlockTimestamp());
            });

            it('should provide the expected lastPrice', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.lastPrice)
                    .to.be.equal(testTicks[testTicks.length - 1] * orderbook.priceTick);
            });

            it('should provide the expected priceChange', async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                const priceTicker = await orderbook.getPriceTicker();
                expect(priceTicker.priceChange)
                    .to.be.equal(Number(testTicks[testTicks.length - 1] * 1000000n / testTicks[testTicks.length - 3]) / 1000000 - 1);
            });
        });

        describe('when new ticks happen', function() {
            it('should emit a PriceChangedEvent for each tick', async function() {
                const abortController = new AbortController();
                try {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const priceTicker = await orderbook.getPriceTicker() as PriceTickerInternal;
                    const events = new Array<PriceChangedEvent>();
                    priceTicker.addEventListener(PriceTickerEventType.PRICE_CHANGED, event => events.push(event), { signal: abortController.signal });
                    await simulateTicks(orderbook.address, testTicks);
                    await ChainEvents.instance.forceUpdate();
                    await priceTicker._waitForUpdater();
                    expect(events)
                        .to.have.length(testTicks.length);
                    for (const [index, event] of events.entries()) {
                        expect(event.newPrice)
                            .to.be.equal(testTicks[index] * orderbook.priceTick);
                    }
                } finally {
                    abortController.abort();
                }
            });
        });

        describe('when a new tick becomes the price 24hs ago', function() {
            beforeEach(async function() {
                const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                await simulateTicks(orderbook.address, testTicks.slice(0, 4), TimeFrame.DAY as number / 4 + 1);
                setTime(await getBlockTimestamp());
            });

            it('should emit a PriceChangedEvent with the new priceChange', async function() {
                const abortController = new AbortController();
                try {
                    const orderbook = await OrderbookDEX.instance.getOrderbook(Object.values(testContracts.orderbooks)[0].address);
                    const priceTicker = await orderbook.getPriceTicker() as PriceTickerInternal;
                    const events = new Array<PriceChangedEvent>();
                    priceTicker.addEventListener(PriceTickerEventType.PRICE_CHANGED, event => events.push(event), { signal: abortController.signal });
                    setTime(now() + (TimeFrame.DAY as number) / 4 + 1);
                    setTime(now() + (TimeFrame.DAY as number) / 4 + 1);
                    setTime(now() + (TimeFrame.DAY as number) / 4 + 1);
                    await priceTicker._waitForUpdater();
                    expect(events)
                        .to.have.length(3);
                    for (const [index, event] of events.entries()) {
                        expect(event.newPrice)
                            .to.be.equal(testTicks[3] * orderbook.priceTick);
                        expect(event.priceChange)
                            .to.be.equal(Number(testTicks[3] * 1000000n / testTicks[index]) / 1000000 - 1);
                    }
                } finally {
                    abortController.abort();
                }
            });
        });
    });
});
