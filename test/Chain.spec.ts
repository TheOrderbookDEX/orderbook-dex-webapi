import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Chain, ChainConnectionFailed, ChainNotConnected, ChainInternal } from '../src/Chain';
import { setUpEthereumProvider, tearDownEthereumProvider } from './ethereum-provider';

use(chaiAsPromised);

describe('Chain', function() {
    describe('static', function() {
        describe('connect', function() {
            describe('when ethereum is undefined', function() {
                it('should fail with ChainConnectionFailed', async function() {
                    await expect(Chain.connect())
                        .to.be.rejectedWith(ChainConnectionFailed);
                });
            });

            describe('when ethereum is defined', function() {
                before(async function() {
                    await setUpEthereumProvider();
                });

                after(async function() {
                    await tearDownEthereumProvider();
                });

                afterEach(function() {
                    ChainInternal.disconnect();
                });

                it('should provide Chain instance', async function() {
                    expect(await Chain.connect())
                        .to.be.equal(Chain.instance);
                });
            });
        });

        describe('instance', function() {
            describe('before connect', function() {
                it('should fail with ChainNotConnected', function() {
                    expect(() => Chain.instance)
                        .to.throw(ChainNotConnected);
                });
            });

            describe('after connect', function() {
                before(async function() {
                    await setUpEthereumProvider();
                });

                after(async function() {
                    await tearDownEthereumProvider();
                });

                beforeEach(async function() {
                    await Chain.connect();
                });

                afterEach(function() {
                    ChainInternal.disconnect();
                });

                it('should not fail', function() {
                    Chain.instance;
                });
            });
        });
    });

    describe('instance', function() {
        before(async function() {
            await setUpEthereumProvider();
        });

        after(async function() {
            await tearDownEthereumProvider();
        });

        beforeEach(async function() {
            await Chain.connect();
        });

        afterEach(function() {
            ChainInternal.disconnect();
        });

        it('should provide the correct chain id', function() {
            expect(Chain.instance.chainId)
                .to.be.equal(1337);
        });

        it('should provide the correct chain name', function() {
            expect(Chain.instance.chainName)
                .to.be.equal('Development Testnet');
        });
    });
});
