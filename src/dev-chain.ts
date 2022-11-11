import { createSigner, getAccounts, getBalance, hexstring } from '@frugal-wizard/abi2ts-lib';
import { IERC20Mock } from '@theorderbookdex/orderbook-dex/dist/testing/interfaces/IERC20Mock';
import { ChainInternal } from './Chain';

export interface DevEthereum {
    request(args: { method: 'evm_setAccountBalance', params: [ address: string, balance: string ] }): Promise<boolean>;
}

export async function getDevChainFunds() {
    const [ address ] = await getAccounts();
    if (ChainInternal.instance._ethereum.isMetaMask) {
        if (!await getBalance(address)) {
            await fetch('http://localhost:8545', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'evm_setAccountBalance',
                    params: [ address, hexstring(1000000000000000000000n) ],
                }),
            });
        }
        const signer = await createSigner('0x0000000000000000000000000000000000000000000000000000000000000001');
        const WBTC = IERC20Mock.at('0xB9816fC57977D5A786E654c7CF76767be63b966e');
        if (!await WBTC.balanceOf(address)) {
            await signer.sendTransaction(await WBTC.populateTransaction.give(address, 1000000000000000000000n))
        }
        const WETH = IERC20Mock.at('0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1');
        if (!await WETH.balanceOf(address)) {
            await signer.sendTransaction(await WETH.populateTransaction.give(address, 1000000000000000000000n))
        }
        const BNB = IERC20Mock.at('0x5CF7F96627F3C9903763d128A1cc5D97556A6b99');
        if (!await BNB.balanceOf(address)) {
            await signer.sendTransaction(await BNB.populateTransaction.give(address, 1000000000000000000000n))
        }
        const WXRP = IERC20Mock.at('0xA3183498b579bd228aa2B62101C40CC1da978F24');
        if (!await WXRP.balanceOf(address)) {
            await signer.sendTransaction(await WXRP.populateTransaction.give(address, 1000000000000000000000n))
        }
        const USDT = IERC20Mock.at('0x63f58053c9499E1104a6f6c6d2581d6D83067EEB');
        if (!await USDT.balanceOf(address)) {
            await signer.sendTransaction(await USDT.populateTransaction.give(address, 1000000000000n))
        }
    } else {
        if (!await getBalance(address)) {
            await (ChainInternal.instance._ethereum as unknown as DevEthereum).request({ method: 'evm_setAccountBalance', params: [ address, hexstring(1000000000000000000000n) ] });
        }
        const WBTC = IERC20Mock.at('0xB9816fC57977D5A786E654c7CF76767be63b966e');
        if (!await WBTC.balanceOf(address)) {
            await WBTC.giveMe(1000000000000000000000n);
        }
        const WETH = IERC20Mock.at('0x6D411e0A54382eD43F02410Ce1c7a7c122afA6E1');
        if (!await WETH.balanceOf(address)) {
            await WETH.giveMe(1000000000000000000000n);
        }
        const BNB = IERC20Mock.at('0x5CF7F96627F3C9903763d128A1cc5D97556A6b99');
        if (!await BNB.balanceOf(address)) {
            await BNB.giveMe(1000000000000000000000n);
        }
        const WXRP = IERC20Mock.at('0xA3183498b579bd228aa2B62101C40CC1da978F24');
        if (!await WXRP.balanceOf(address)) {
            await WXRP.giveMe(1000000000000000000000n);
        }
        const USDT = IERC20Mock.at('0x63f58053c9499E1104a6f6c6d2581d6D83067EEB');
        if (!await USDT.balanceOf(address)) {
            await USDT.giveMe(1000000000000n);
        }
    }
}
