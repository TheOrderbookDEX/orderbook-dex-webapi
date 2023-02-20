import { getAccounts, getBalance, hexstring } from '@frugalwizard/abi2ts-lib';
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
    } else {
        if (!await getBalance(address)) {
            await (ChainInternal.instance._ethereum as unknown as DevEthereum).request({ method: 'evm_setAccountBalance', params: [ address, hexstring(1000000000000000000000n) ] });
        }
    }
}
