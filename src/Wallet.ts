import { Address, ZERO_ADDRESS } from './Address';
import { APIEvents, WalletConnectedEvent } from './APIEvents';
import { ChainInternal } from './Chain';
import { OrderbookDEXInternal } from './OrderbookDEX';
import { IOperatorFactory } from '@theorderbookdex/orderbook-dex-operator/dist/interfaces/IOperatorFactory';
import { getDevChainFunds } from './dev-chain';
import { isProviderRpcError, USER_REJECTED_REQUEST } from './ethereum';
import { Orderbook } from './Orderbook';
import { checkAbortSignal, createSubAbortController, max, min } from './utils';
import { abidecode, abiencode, ContractEvent, decodeErrorData, MAX_UINT32, Transaction } from '@theorderbookdex/abi2ts-lib';
import { BoughtAtMarket, Failed, IOperator, OrderCanceled, OrderClaimed, PlacedBuyOrder, PlacedSellOrder, SoldAtMarket } from '@theorderbookdex/orderbook-dex-operator/dist/interfaces/IOperator';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { Cache } from './Cache';
import { OrderInternal, Order, OrderExecutionType, OrderStatus, OrderType } from './Order';
import { now } from './time';
import { GenericEventListener } from './event-types';
import { Token } from './Token';
import { Canceled, Filled, IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { ChainEvents } from './ChainEvents';

export interface TokenBalance {
    wallet: bigint;
    operator: bigint;
}

export enum WalletEventType {
    /**
     * Event type dispatched when an order is created.
     */
    ORDER_CREATED = 'orderCreated',

    /**
     * Event type dispatched when an order is updated.
     */
    ORDER_UPDATED = 'orderUpdated',

    /**
     * Event type dispatched when tokens have been deposited into the operator.
     */
    TOKEN_DEPOSITED = 'tokenDeposited',

    /**
     * Event type dispatched when tokens have been withdrawn from the operator.
     */
    TOKEN_WITHDRAWN = 'tokenWithdrawn',
}

/**
 * Crypto Wallet connection.
 */
export abstract class Wallet extends EventTarget {
    /**
     * Connect to the wallet.
     *
     * @param  requestUserPermission Whether to request user permission to connect to the wallet
     *                               if required. Optional, true by default.
     * @return The wallet.
     * @throws {ChainNotConnected} When connection to the blockchain has not been established.
     * @throws {PermissionToWalletRequired} When the user needs to be asked for permission to
     *                                      connect to the wallet.
     * @throws {WalletConnectionRejected} When user rejected the request to connect the wallet.
     * @throws {WalletAddressNotFound} When an address is not provided by the wallet.
     * @throws {RegisterRequired} When the user needs to register.
     */
    static async connect(requestUserPermission = true): Promise<Wallet> {
        return await WalletInternal.connect(requestUserPermission);
    }

    /**
     * Connect to the wallet and register.
     *
     * @return The wallet.
     * @throws {ChainNotConnected} When connection to the blockchain has not been established.
     * @throws {WalletConnectionRejected} When user rejected the request to connect the wallet.
     * @throws {WalletAddressNotFound} When an address is not provided by the wallet.
     * @throws {AlreadyRegistered} When the user is already registered.
     * @throws {RegisterRejected} When the user rejects the request to create the operator.
     */
    static async register(): Promise<Wallet> {
        return await WalletInternal.register();
    }

    /**
     * The connection to the wallet.
     */
    static get instance(): Wallet {
        return WalletInternal.instance;
    }

    /**
     * The address of the wallet.
     */
    abstract get address(): Address;

    /**
     * Get the amount of tokens the user has in the wallet and the operator.
     *
     * @param token       The token.
     * @param abortSignal A signal to abort the operation.
     * @returns           The amount of tokens the user has in the wallet and the operator.
     */
    abstract getBalance(token: Token, abortSignal?: AbortSignal): Promise<TokenBalance>;

    /**
     * Deposit an amount of tokens into the operator.
     *
     * @param token       The token.
     * @param amount        The amount.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     */
    abstract deposit(token: Token, amount: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Withdraw an amount of tokens from the operator.
     *
     * @param token       The token.
     * @param amount      The amount.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     */
    abstract withdraw(token: Token, amount: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Get the orders of the user.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The orders.
     */
    abstract orders(abortSignal?: AbortSignal): AsyncIterable<Order>;

    /**
     * Execute a buy at market operation.
     *
     * @param orderbook     The orderbook.
     * @param maxAmount     The maximum amount of contracts to buy.
     * @param maxPrice      The maximum price to pay for each contract.
     * @param abortSignal   A signal to abort. It won't stop the blockchain transaction, just
     *                      prevent the promise from returning.
     */
    abstract buyAtMarket(orderbook: Orderbook, maxAmount: bigint, maxPrice: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Execute a sell at market operation.
     *
     * @param orderbook     The orderbook.
     * @param maxAmount     The maximum amount of contracts to sell.
     * @param minPrice      The minimum price to sell each contract for.
     * @param abortSignal   A signal to abort. It won't stop the blockchain transaction, just
     *                      prevent the promise from returning.
     */
    abstract sellAtMarket(orderbook: Orderbook, maxAmount: bigint, minPrice: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Execute a place buy order operation.
     *
     * @param orderbook     The orderbook.
     * @param maxAmount     The maximum amount of contracts to buy.
     * @param price         The price to pay for each contract.
     * @param abortSignal   A signal to abort. It won't stop the blockchain transaction, just
     *                      prevent the promise from returning.
     */
    abstract placeBuyOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Execute a place sell order operation.
     *
     * @param orderbook     The orderbook.
     * @param maxAmount     The maximum amount of contracts to sell.
     * @param price         The price to sell each contract for.
     * @param abortSignal   A signal to abort. It won't stop the blockchain transaction, just
     *                      prevent the promise from returning.
     */
    abstract placeSellOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Claim an order.
     *
     * @param order       The order.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     */
    abstract claimOrder(order: Order, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Cancel an order.
     *
     * @param order       The order.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     */
    abstract cancelOrder(order: Order, abortSignal?: AbortSignal): Promise<void>;

    addEventListener(type: WalletEventType.ORDER_CREATED, callback: GenericEventListener<OrderCreatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: WalletEventType.ORDER_UPDATED, callback: GenericEventListener<OrderUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: WalletEventType.TOKEN_DEPOSITED, callback: GenericEventListener<TokenDepositedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: WalletEventType.TOKEN_WITHDRAWN, callback: GenericEventListener<TokenWithdrawnEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: WalletEventType, callback: GenericEventListener<WalletEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: WalletEventType.ORDER_CREATED, callback: GenericEventListener<OrderCreatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: WalletEventType.ORDER_UPDATED, callback: GenericEventListener<OrderUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: WalletEventType.TOKEN_DEPOSITED, callback: GenericEventListener<TokenDepositedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: WalletEventType.TOKEN_WITHDRAWN, callback: GenericEventListener<TokenWithdrawnEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: WalletEventType, callback: GenericEventListener<WalletEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    /** @internal */
    dispatchEvent(event: WalletEvent): boolean {
        return super.dispatchEvent(event);
    }

    protected constructor() {
        super();
    }
}

export class WalletInternal extends Wallet {
    private static _instance?: WalletInternal;

    static async connect(requestUserPermission: boolean): Promise<WalletInternal> {
        if (!this._instance) {
            const operatorFactory = IOperatorFactory.at(OrderbookDEXInternal.instance._config.operatorFactory);
            const ethereum = ChainInternal.instance._ethereum;
            let accounts: string[];
            try {
                if (ethereum.isMetaMask && requestUserPermission) {
                    accounts = await ethereum.request({ method: 'eth_requestAccounts' });
                } else {
                    accounts = await ethereum.request({ method: 'eth_accounts' });
                }
            } catch (error) {
                if (isProviderRpcError(error)) {
                    if (error.code == USER_REJECTED_REQUEST) {
                        throw new WalletConnectionRejected();
                    }
                }
                throw error;
            }
            if (!accounts.length) {
                if (ethereum.isMetaMask && !requestUserPermission) {
                    throw new PermissionToWalletRequired();
                } else {
                    throw new WalletAddressNotFound();
                }
            }
            const operator = await operatorFactory.operator(accounts[0]);
            if (operator == ZERO_ADDRESS) {
                throw new RegisterRequired();
            }
            this._instance = new WalletInternal(accounts[0] as Address, operator as Address);
            APIEvents.instance.dispatchEvent(new WalletConnectedEvent());
        }
        return this._instance;
    }

    static async register(): Promise<WalletInternal> {
        if (this._instance) {
            throw new AlreadyRegistered();
        }
        const operatorFactory = IOperatorFactory.at(OrderbookDEXInternal.instance._config.operatorFactory);
        const ethereum = ChainInternal.instance._ethereum;
        let accounts: string[];
        try {
            if (ethereum.isMetaMask) {
                accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            } else {
                accounts = await ethereum.request({ method: 'eth_accounts' });
            }
        } catch (error) {
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new WalletConnectionRejected();
                }
            }
            throw error;
        }
        if (!accounts.length) throw new WalletAddressNotFound();
        if (await operatorFactory.operator(accounts[0]) != ZERO_ADDRESS) {
            throw new AlreadyRegistered();
        }
        if (ChainInternal.instance.chainId == 1337) {
            await getDevChainFunds();
        }
        try {
            await operatorFactory.createOperator();
        } catch (error) {
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new RegisterRejected();
                }
            }
            throw error;
        }
        const operator = await operatorFactory.operator(accounts[0]);
        this._instance = new WalletInternal(accounts[0] as Address, operator as Address);
        APIEvents.instance.dispatchEvent(new WalletConnectedEvent());
        return this._instance;
    }

    static disconnect() {
        if (this._instance) {
            this._instance.abortController.abort();
            delete this._instance;
        }
    }

    static get instance(): WalletInternal {
        if (!this._instance) {
            throw new WalletNotConnected();
        }
        return this._instance;
    }

    private readonly abortController = new AbortController();

    constructor(
        public readonly address: Address,
        public readonly _operator: Address,
    ) {
        super();
        void (async () => {
            for await (const order of Cache.instance.getOpenOrders(_operator, this.abortController.signal)) {
                this.trackOrder(order);
            }
        })();
    }

    async getBalance(token: Token, abortSignal?: AbortSignal) {
        const contract = IERC20.at(token.address);
        const wallet = await contract.balanceOf(this.address);
        checkAbortSignal(abortSignal);
        const operator = await contract.balanceOf(this._operator);
        checkAbortSignal(abortSignal);
        return { wallet, operator };
    }

    async deposit(token: Token, amount: bigint, abortSignal?: AbortSignal) {
        const tokenContract = IERC20.at(token.address);
        const sender = this.address
        const operator = this._operator;
        try {
            if (await tokenContract.balanceOf(sender) < amount) {
                throw new InsufficientFunds();
            }
            await tokenContract.transfer(operator, amount);
        } catch (error) {
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        this.dispatchEvent(new TokenDepositedEvent(token, amount));
        checkAbortSignal(abortSignal);
    }

    async withdraw(token: Token, amount: bigint, abortSignal?: AbortSignal) {
        const tokenContract = IERC20.at(token.address);
        const operator = IOperator.at(this._operator);
        try {
            if (await tokenContract.balanceOf(operator) < amount) {
                throw new InsufficientFunds();
            }
            await operator.withdrawERC20([ [ token, amount ] ]);
        } catch (error) {
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        this.dispatchEvent(new TokenWithdrawnEvent(token, amount));
        checkAbortSignal(abortSignal);
    }

    private trackOrder(order: OrderInternal) {
        void (async () => {
            const abortController = createSubAbortController(this.abortController.signal);
            const abortSignal = abortController.signal;

            // abort and retrack when order gets updated
            this.addEventListener(WalletEventType.ORDER_UPDATED, event => {
                if (event.order.key == order.key) {
                    abortController.abort();
                    this.trackOrder(event.order as OrderInternal);
                }
            }, { signal: abortSignal });

            if (order.status.includes(OrderStatus.PENDING)) {
                await this.trackOrderPending(order, abortSignal);

            } else if (order.status.includes(OrderStatus.OPEN)) {
                if (order.claimTxHash) {
                    await this.trackOrderClaim(order, abortSignal);

                } else if (order.cancelTxHash) {
                    await this.trackOrderCancel(order, abortSignal);

                } else if (!order.status.includes(OrderStatus.FILLED)) {
                    await this.trackOrderFill(order, abortSignal);
                }
            }
        })();
    }

    private async trackOrderPending(order: OrderInternal, abortSignal: AbortSignal) {
        const { events } = await Transaction.get(order.txHash);
        checkAbortSignal(abortSignal);

        order = { ...order, txHash: '' };

        for (const event of events) {
            if (event instanceof BoughtAtMarket) {
                order = {
                    ...order,
                    filled: event.amountBought,
                    claimed: event.amountBought,
                    totalPrice: event.amountPaid,
                    totalPriceClaimed: event.amountPaid,
                };

            } else if (event instanceof SoldAtMarket) {
                order = {
                    ...order,
                    filled: event.amountSold,
                    claimed: event.amountSold,
                    totalPrice: event.amountReceived,
                    totalPriceClaimed: event.amountReceived,
                };

            } else if (event instanceof PlacedBuyOrder) {
                order = {
                    ...order,
                    id: event.orderId,
                };

            } else if (event instanceof PlacedSellOrder) {
                order = {
                    ...order,
                    id: event.orderId,
                };

            } else if (event instanceof Failed) {
                // TODO error feedback
                order = {
                    ...order,
                    error: 'Unexpected error',
                };
                console.error(decodeErrorData(event.error));
            }
        }

        await this.saveOrder(order, abortSignal);
    }

    private async trackOrderFill(order: OrderInternal, abortSignal: AbortSignal) {
        const [ type, price, id ] = abidecode(['uint8', 'uint256', 'uint32'], order.id as string) as [number, bigint, bigint];
        const orderbook = IOrderbookV1.at(order.orderbook.address);

        const updateOrder = async () => {
            const { totalFilled } = await orderbook.pricePoint(type, price);
            checkAbortSignal(abortSignal);

            const { owner, totalPlacedBeforeOrder, amount: placedAmount } = await orderbook.order(type, price, id);
            checkAbortSignal(abortSignal);

            if (!owner) {
                order = {
                    ...order,
                    id: '',
                    error: 'Order no longer exists',
                };
                await this.saveOrder(order, abortSignal);
                return;
            }

            // if the order amount differs that's because there's some amount that's been filled
            // at market before placing the order
            const prefilled = order.amount - placedAmount;

            const filled = min(order.amount, prefilled + max(0n, totalFilled - totalPlacedBeforeOrder));

            if (filled > order.filled) {
                const totalPrice = order.totalPrice + order.price * (filled - order.filled);

                order = { ...order, filled, totalPrice };

                await this.saveOrder(order, abortSignal);
            }
        };

        const listener = async (event: ContractEvent) => {
            if (event instanceof Filled) {
                if (event.orderType == type && event.price == price) {
                    await updateOrder();
                }
            } else if (event instanceof Canceled) {
                if (event.orderType == type && event.price == price) {
                    await updateOrder();
                }
            }
        };

        ChainEvents.instance.on(orderbook.address, listener);
        abortSignal.addEventListener('abort', () => {
            ChainEvents.instance.off(orderbook.address, listener);
        }, { once: true });

        await updateOrder();
    }

    private async trackOrderClaim(order: OrderInternal, abortSignal: AbortSignal) {
        const { events } = await Transaction.get(order.claimTxHash);
        checkAbortSignal(abortSignal);

        order = { ...order, claimTxHash: '' };

        for (const event of events) {
            if (event instanceof OrderClaimed) {
                order = {
                    ...order,
                    claimed: order.claimed + event.amount,
                    totalPriceClaimed: order.totalPriceClaimed + event.amount * order.price,
                };

            } else if (event instanceof Failed) {
                // TODO error feedback
                order = {
                    ...order,
                    error: 'Unexpected error',
                };
                console.error(decodeErrorData(event.error));
            }
        }

        await this.saveOrder(order, abortSignal);
    }

    private async trackOrderCancel(order: OrderInternal, abortSignal: AbortSignal) {
        const { events } = await Transaction.get(order.cancelTxHash);
        checkAbortSignal(abortSignal);

        order = { ...order, cancelTxHash: '' };

        for (const event of events) {
            if (event instanceof OrderCanceled) {
                order = {
                    ...order,
                    amount: order.amount - event.amount,
                    canceled: event.amount,
                };

            } else if (event instanceof Failed) {
                // TODO error feedback
                order = {
                    ...order,
                    error: 'Unexpected error',
                };
                console.error(decodeErrorData(event.error));
            }
        }

        await this.saveOrder(order, abortSignal);
    }

    orders(abortSignal?: AbortSignal): AsyncIterable<Order> {
        return Cache.instance.getOrders(this._operator, abortSignal);
    }

    private async createOrder(txHash: string, orderbook: Orderbook, type: OrderType, execution: OrderExecutionType, price: bigint, amount: bigint) {
        const order = updateOrderStatus({
            key: txHash,
            owner: this._operator,
            orderbook,
            txHash,
            id: '',
            timestamp: now(),
            status: [],
            type,
            execution,
            price,
            totalPrice: 0n,
            totalPriceClaimed: 0n,
            amount,
            filled: 0n,
            claimed: 0n,
            canceled: 0n,
            error: '',
            claimTxHash: '',
            cancelTxHash: '',
        });
        await Cache.instance.saveOrder(order);
        this.dispatchEvent(new OrderCreatedEvent(order));
        this.trackOrder(order);
    }

    private async saveOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        order = updateOrderStatus(order);
        await Cache.instance.saveOrder(order, abortSignal);
        this.dispatchEvent(new OrderUpdatedEvent(order));
    }

    private async refreshOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        return await Cache.instance.getOrder(order.key, abortSignal);
    }

    async buyAtMarket(orderbook: Orderbook, maxAmount: bigint, maxPrice: bigint, abortSignal?: AbortSignal) {
        const operator = IOperator.at(this._operator);
        const baseToken = IERC20.at(orderbook.baseToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;
        const extraData = abiencode([ 'uint8' ], [ maxPricePoints ]);
        // TODO estimate gas for transaction
        try {
            if (await baseToken.balanceOf(operator) < maxAmount * maxPrice) {
                throw new InsufficientFunds();
            }
            // TODO check for more errors before sending transaction
            const hash = await operator.sendTransaction.buyAtMarket(orderbook.address, maxAmount, maxPrice, extraData);
            await this.createOrder(hash, orderbook, OrderType.BUY, OrderExecutionType.MARKET, maxPrice, maxAmount);
        } catch (error) {
            checkAbortSignal(abortSignal);
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        checkAbortSignal(abortSignal);
    }

    async sellAtMarket(orderbook: Orderbook, maxAmount: bigint, minPrice: bigint, abortSignal?: AbortSignal) {
        const operator = IOperator.at(this._operator);
        const tradedToken = IERC20.at(orderbook.tradedToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;
        const extraData = abiencode([ 'uint8' ], [ maxPricePoints ]);
        // TODO estimate gas for transaction
        try {
            if (await tradedToken.balanceOf(operator) < maxAmount * orderbook.contractSize) {
                throw new InsufficientFunds();
            }
            // TODO check for more errors before sending transaction
            const hash = await operator.sendTransaction.sellAtMarket(orderbook.address, maxAmount, minPrice, extraData);
            await this.createOrder(hash, orderbook, OrderType.SELL, OrderExecutionType.MARKET, minPrice, maxAmount);
        } catch (error) {
            checkAbortSignal(abortSignal);
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        checkAbortSignal(abortSignal);
    }

    async placeBuyOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal) {
        const operator = IOperator.at(this._operator);
        const baseToken = IERC20.at(orderbook.baseToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;
        const extraData = abiencode([ 'uint8' ], [ maxPricePoints ]);
        // TODO estimate gas for transaction
        try {
            if (await baseToken.balanceOf(operator) < maxAmount * price) {
                throw new InsufficientFunds();
            }
            // TODO check for more errors before sending transaction
            const hash = await operator.sendTransaction.placeBuyOrder(orderbook.address, maxAmount, price, extraData);
            await this.createOrder(hash, orderbook, OrderType.BUY, OrderExecutionType.LIMIT, price, maxAmount);
        } catch (error) {
            checkAbortSignal(abortSignal);
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        checkAbortSignal(abortSignal);
    }

    async placeSellOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal) {
        const operator = IOperator.at(this._operator);
        const tradedToken = IERC20.at(orderbook.tradedToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;
        const extraData = abiencode([ 'uint8' ], [ maxPricePoints ]);
        // TODO estimate gas for transaction
        try {
            if (await tradedToken.balanceOf(operator) < maxAmount * orderbook.contractSize) {
                throw new InsufficientFunds();
            }
            // TODO check for more errors before sending transaction
            const hash = await operator.sendTransaction.placeSellOrder(orderbook.address, maxAmount, price, extraData);
            await this.createOrder(hash, orderbook, OrderType.SELL, OrderExecutionType.LIMIT, price, maxAmount);
        } catch (error) {
            checkAbortSignal(abortSignal);
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        checkAbortSignal(abortSignal);
    }

    async claimOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        const operator = IOperator.at(this._operator);
        const maxAmount = MAX_UINT32;
        const extraData = abiencode([ 'uint32' ], [ maxAmount ]);
        try {
            const claimTxHash = await operator.sendTransaction.claimOrder(order.orderbook, order.id, extraData);
            order = await this.refreshOrder(order);
            order = { ...order, claimTxHash };
            await this.saveOrder(order);
        } catch (error) {
            checkAbortSignal(abortSignal);
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        checkAbortSignal(abortSignal);
    }

    async cancelOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        const operator = IOperator.at(this._operator);
        // TODO allow user to configure maxLastOrderId
        const maxLastOrderId = MAX_UINT32;
        const extraData = abiencode([ 'uint32' ], [ maxLastOrderId ]);
        try {
            const cancelTxHash = await operator.sendTransaction.cancelOrder(order.orderbook, order.id, extraData);
            order = await this.refreshOrder(order);
            order = { ...order, cancelTxHash };
            await this.saveOrder(order);
        } catch (error) {
            checkAbortSignal(abortSignal);
            if (isProviderRpcError(error)) {
                if (error.code == USER_REJECTED_REQUEST) {
                    throw new OperationRejected();
                }
            }
            throw error;
        }
        checkAbortSignal(abortSignal);
    }
}

function updateOrderStatus(order: OrderInternal): OrderInternal {
    const status: OrderStatus[] = [];

    if (order.txHash) {
        status.push(OrderStatus.PENDING);
    } else if (order.id && order.claimed < order.amount) {
        status.push(OrderStatus.OPEN);
    } else {
        status.push(OrderStatus.CLOSED);
    }

    if (order.filled) {
        if (order.filled < order.amount) {
            status.push(OrderStatus.PARTIALLY_FILLED);
        } else {
            status.push(OrderStatus.FILLED);
        }
    } else {
        status.push(OrderStatus.NOT_FILLED);
    }

    if (order.claimTxHash) {
        status.push(OrderStatus.PENDING_CLAIM);
    } else if (order.claimed < order.filled) {
        if (!order.cancelTxHash) {
            status.push(OrderStatus.CLAIMABLE);
        }
    } else if (order.filled) {
        status.push(OrderStatus.CLAIMED);
    }

    if (order.cancelTxHash) {
        status.push(OrderStatus.PENDING_CANCEL);
    } else if (order.canceled) {
        status.push(OrderStatus.CANCELED);
    } else if (order.id && order.filled < order.amount) {
        if (!order.claimTxHash) {
            status.push(OrderStatus.CANCELABLE);
        }
    }

    if (order.error) {
        status.push(OrderStatus.ERROR);
    }

    return { ...order, status };
}

/**
 * Event dispatched from Wallet.
 */
export abstract class WalletEvent extends Event {
    constructor(type: WalletEventType) {
        super(type);
    }
}

/**
 * Event dispatched when an order is created.
 */
export class OrderCreatedEvent extends WalletEvent {
    /** @internal */
    constructor(readonly order: Order) {
        super(WalletEventType.ORDER_CREATED);
    }
}

/**
 * Event dispatched when an order is updated.
 */
export class OrderUpdatedEvent extends WalletEvent {
    /** @internal */
    constructor(readonly order: Order) {
        super(WalletEventType.ORDER_UPDATED);
    }
}

/**
 * Event dispatched when tokens have been deposited into the operator.
 */
export class TokenDepositedEvent extends WalletEvent {
    /** @internal */
    constructor(readonly token: Token, readonly amount: bigint) {
        super(WalletEventType.TOKEN_DEPOSITED);
    }
}

/**
 * Event dispatched when tokens have been withdrawn from the operator.
 */
export class TokenWithdrawnEvent extends WalletEvent {
    /** @internal */
    constructor(readonly token: Token, readonly amount: bigint) {
        super(WalletEventType.TOKEN_WITHDRAWN);
    }
}

/**
 * Error thrown when the user needs to be asked for permission to connect to the wallet.
 */
export class PermissionToWalletRequired extends Error {
    /** @internal */
    constructor() {
        super('User Permission To Wallet Required');
        this.name = 'UserPermissionToWalletRequired';
    }
}

/**
 * Error thrown when the user rejected the request to connect the wallet.
 */
export class WalletConnectionRejected extends Error {
    /** @internal */
    constructor() {
        super('Wallet Connection Rejected');
        this.name = 'WalletConnectionRejected';
    }
}

/**
 * Error thrown when trying to access the wallet singleton instance before it is
 * connected.
 */
export class WalletNotConnected extends Error {
    /** @internal */
    constructor() {
        super('Wallet Not Connected');
        this.name = 'WalletNotConnected';
    }
}

/**
 * Error thrown when a wallet address is not provided.
 *
 * This probably means that the user has not generated their account.
 */
export class WalletAddressNotFound extends Error {
    /** @internal */
    constructor() {
        super('Wallet Address Not Found');
        this.name = 'WalletAddressNotFound';
    }
}

/**
 * Error thrown when the user needs to register.
 */
export class RegisterRequired extends Error {
    /** @internal */
    constructor() {
        super('Register Required');
        this.name = 'RegisterRequired';
    }
}

/**
 * Error thrown when the user is already registered.
 */
export class AlreadyRegistered extends Error {
    /** @internal */
    constructor() {
        super('Already Registered');
        this.name = 'AlreadyRegistered';
    }
}

/**
 * Error thrown when the user rejects the request to create the operator.
 */
export class RegisterRejected extends Error {
    /** @internal */
    constructor() {
        super('Register Rejected');
        this.name = 'RegisterRejected';
    }
}

/**
 * Error thrown when the user rejected the request to execute an operation.
 */
export class OperationRejected extends Error {
    /** @internal */
    constructor() {
        super('Operation Rejected');
        this.name = 'OperationRejected';
    }
}

/**
 * Error thrown when there are not sufficient funds for an operation.
 */
export class InsufficientFunds extends Error {
    /** @internal */
    constructor() {
        super('Insufficient Funds');
        this.name = 'InsufficientFunds';
    }
}
