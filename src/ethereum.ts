export interface Ethereum {
    isMetaMask?: boolean;
    request(args: { method: 'eth_chainId' }): Promise<string>;
    request(args: { method: 'eth_accounts' }): Promise<string[]>;
    request(args: { method: 'eth_requestAccounts' }): Promise<string[]>;
    on(eventName: 'chainChanged', listener: (chainId: string) => void): void;
    on(eventName: 'accountsChanged', listener: (accounts: string[]) => void): void;
}

export function getEthereum(): Ethereum | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return 'ethereum' in globalThis ? (globalThis as any).ethereum as Ethereum : undefined;
}

export interface ProviderRpcError {
    code: number;
}

export const USER_REJECTED_REQUEST = 4001;

export function isProviderRpcError(error: unknown): error is ProviderRpcError {
    return error instanceof Object
        && 'code' in error
        && typeof (error as ProviderRpcError).code == 'number';
}
