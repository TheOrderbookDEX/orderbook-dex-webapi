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

interface ObjectWithCodeProperty {
    code: unknown;
}

function isObjectWithCodeProperty(value: unknown): value is ObjectWithCodeProperty {
    return value !== null && typeof value == 'object' && 'code' in value;
}

export function isUserRejectionError(error: unknown): boolean {
    if (isObjectWithCodeProperty(error)) {
        if (error.code === 4001) return true;
        if (error.code === 'ACTION_REJECTED') return true;
    }
    return false;
}
