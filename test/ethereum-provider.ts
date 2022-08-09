import ganache, { EthereumProvider } from 'ganache';
import levelup from 'levelup';
import memdown from 'memdown';

interface Global {
    ethereum?: EthereumProvider;
}

const global = globalThis as Global;

export async function setUpEthereumProvider(withAccount = false) {
    global.ethereum = ganache.provider({
        logging: {
            quiet: true,
        },
        wallet: {
            accounts: withAccount ? [
                {
                    secretKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
                    balance: 0,
                }
            ] : [],
        },
        database: {
            db: levelup(memdown()),
        }
    });
}

export async function tearDownEthereumProvider() {
    delete global.ethereum;
}
