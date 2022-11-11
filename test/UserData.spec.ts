import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Orderbook, OrderbookDEX } from '../src';
import { Chain, ChainNotConnected } from '../src/Chain';
import { UserData, UserDataNotLoaded } from '../src/UserData';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';
import { resetIndexedDB } from './indexeddb';
import { setUpSmartContracts } from './smart-contracts';

use(chaiAsPromised);

const defaultOrderbooks: { [address: string]: {
    tradedToken: string;
    baseToken: string;
    contractSize: bigint;
    priceTick: bigint;
} } = {
    '0x3E920B0890189806A99451699e4e531E81035BA6': {
        tradedToken: 'WBTC',
        baseToken: 'USDT',
        contractSize: 1000000000000000n,
        priceTick: 100000000n,
    },
    '0x119F7448b228415C974f5814462Ec5a87837678f': {
        tradedToken: 'WETH',
        baseToken: 'USDT',
        contractSize: 10000000000000000n,
        priceTick: 10000000n,
    },
    '0xB880b3FB12a48815fD79E30394a8F336159d3188': {
        tradedToken: 'BNB',
        baseToken: 'USDT',
        contractSize: 100000000000000000n,
        priceTick: 1000000n,
    },
    '0xD86519C020EfC929eb2D0B967499267f287493c7': {
        tradedToken: 'WXRP',
        baseToken: 'USDT',
        contractSize: 1000000000000000000n,
        priceTick: 10000n,
    },
};

const defaultTokens: { [address: string]: {
    name: string;
    symbol: string;
    decimals: number;
} } = {
    '0xB9816fC57977D5A786E654c7CF76767be63b966e' : {
        name: 'Wrapped BTC',
        symbol: 'WBTC',
        decimals: 18,
    },
    '0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1': {
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18,
    },
    '0x5CF7F96627F3C9903763d128A1cc5D97556A6b99': {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18,
    },
    '0xA3183498b579bd228aa2B62101C40CC1da978F24': {
        name: 'Wrapped XRP',
        symbol: 'WXRP',
        decimals: 18,
    },
    '0x63f58053c9499E1104a6f6c6d2581d6D83067EEB': {
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
    },
};

describe('UserData', function() {
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

        describe('load', function() {
            describe('before connecting chain', function() {
                it('should fail with ChainNotConnected', async function() {
                    await expect(UserData.load())
                        .to.be.rejectedWith(ChainNotConnected);
                });
            });

            describe('after connecting chain', function() {
                beforeEach(async function() {
                    await Chain.connect();
                });

                afterEach(function() {
                    UserData.unload();
                    Chain.disconnect();
                });

                it('should provide UserData instance', async function() {
                    expect(await UserData.load())
                        .to.be.equal(UserData.instance);
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

            describe('before load', function() {
                it('should fail with UserDataNotLoaded', function() {
                    expect(() => UserData.instance)
                        .to.throw(UserDataNotLoaded)
                });
            });

            describe('after load', function() {
                beforeEach(async function() {
                    await UserData.load();
                });

                afterEach(async function() {
                    UserData.unload();
                });

                it('should not fail', function() {
                    UserData.instance;
                });
            });
        });
    });

    describe('instance', function() {
        beforeEach(async function() {
            await setUpEthereumProvider();
            await Chain.connect();
            await setUpSmartContracts();
            await UserData.load();
            await OrderbookDEX.connect();
        });

        afterEach(async function() {
            OrderbookDEX.disconnect();
            UserData.unload();
            Chain.disconnect();
            await tearDownEthereumProvider();
            resetIndexedDB();
        });

        describe('savedOrderbooks', function() {
            describe('after getting for first time', function() {
                it('should return default orderbooks', async function() {
                    const orderbooks: Orderbook[] = [];
                    for await (const orderbook of UserData.instance.savedOrderbooks()) {
                        orderbooks.push(orderbook);
                    }
                    expect(orderbooks.map(({ address }) => address))
                        .to.have.members(Object.keys(defaultOrderbooks));
                    for (const orderbook of orderbooks) {
                        const expected = defaultOrderbooks[orderbook.address];
                        expect(orderbook.tradedToken.symbol)
                            .to.be.equal(expected.tradedToken);
                        expect(orderbook.baseToken.symbol)
                            .to.be.equal(expected.baseToken);
                        expect(orderbook.contractSize)
                            .to.be.equal(expected.contractSize);
                        expect(orderbook.priceTick)
                            .to.be.equal(expected.priceTick);
                    }
                });
            });

            describe('after getting a second time', function() {
                beforeEach(async function() {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
                    for await (const _ of UserData.instance.savedOrderbooks()) {}
                });

                it('should return default orderbooks', async function() {
                    const orderbooks: Orderbook[] = [];
                    for await (const orderbook of UserData.instance.savedOrderbooks()) {
                        orderbooks.push(orderbook);
                    }
                    expect(orderbooks.map(({ address }) => address))
                        .to.have.members(Object.keys(defaultOrderbooks));
                    for (const orderbook of orderbooks) {
                        const expected = defaultOrderbooks[orderbook.address];
                        expect(orderbook.tradedToken.symbol)
                            .to.be.equal(expected.tradedToken);
                        expect(orderbook.baseToken.symbol)
                            .to.be.equal(expected.baseToken);
                        expect(orderbook.contractSize)
                            .to.be.equal(expected.contractSize);
                        expect(orderbook.priceTick)
                            .to.be.equal(expected.priceTick);
                    }
                });
            });
        });

        describe('saveOrderbook', function() {
            // TODO
        });

        describe('forgetOrderbook', function() {
            // TODO
        });

        describe('trackedTokens', function() {
            describe('after getting for first time', function() {
                it('should return default tokens', async function() {
                    const tokens = [];
                    for await (const { address, name, symbol, decimals } of UserData.instance.trackedTokens()) {
                        tokens.push({ address, name, symbol, decimals });
                    }
                    expect(tokens.map(({ address }) => address))
                        .to.have.members(Object.keys(defaultTokens));
                    for (const token of tokens) {
                        const expected = defaultTokens[token.address];
                        expect(token.name)
                            .to.be.equal(expected.name);
                        expect(token.symbol)
                            .to.be.equal(expected.symbol);
                        expect(token.decimals)
                            .to.be.equal(expected.decimals);
                    }
                });
            });

            describe('after getting a second time', function() {
                beforeEach(async function() {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
                    for await (const _ of UserData.instance.trackedTokens()) {}
                });

                it('should return default tokens', async function() {
                    const tokens = [];
                    for await (const { address, name, symbol, decimals } of UserData.instance.trackedTokens()) {
                        tokens.push({ address, name, symbol, decimals });
                    }
                    expect(tokens.map(({ address }) => address))
                        .to.have.members(Object.keys(defaultTokens));
                    for (const token of tokens) {
                        const expected = defaultTokens[token.address];
                        expect(token.name)
                            .to.be.equal(expected.name);
                        expect(token.symbol)
                            .to.be.equal(expected.symbol);
                        expect(token.decimals)
                            .to.be.equal(expected.decimals);
                    }
                });
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
