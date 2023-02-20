import { Address, ZERO_ADDRESS } from './Address';
import { APIEvents, WalletConnectedEvent } from './APIEvents';
import { ChainInternal } from './Chain';
import { OrderbookDEX, OrderbookDEXInternal } from './OrderbookDEX';
import { IOperatorFactory } from '@theorderbookdex/orderbook-dex-operator/dist/interfaces/IOperatorFactory';
import { getDevChainFunds } from './dev-chain';
import { isUserRejectionError } from './ethereum';
import { Orderbook } from './Orderbook';
import { createSubAbortController, max, min } from './utils';
import { ContractEvent, decodeErrorData, MAX_UINT32, Transaction } from '@frugalwizard/abi2ts-lib';
import { IERC20 } from '@theorderbookdex/orderbook-dex/dist/interfaces/IERC20';
import { IERC20WithFaucet, FaucetOnCooldown as FaucetOnCooldownContractError } from '@theorderbookdex/orderbook-dex/dist/testing/interfaces/IERC20WithFaucet';
import { Database } from './Database';
import { OrderInternal, Order, OrderExecutionType, OrderStatus, OrderType, encodeOrderType } from './Order';
import { now } from './time';
import { GenericEventListener } from './event-types';
import { Token } from './Token';
import { Canceled, Filled, IOrderbookV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookV1';
import { ChainEvents } from './ChainEvents';
import { IOperatorV1, BoughtAtMarketV1, SoldAtMarketV1, PlacedBuyOrderV1, PlacedSellOrderV1, Failed, OrderClaimedV1, OrderCanceledV1 } from '@theorderbookdex/orderbook-dex-v1-operator/dist/interfaces/IOperatorV1';
import { IOrderbookFactoryV1 } from '@theorderbookdex/orderbook-dex-v1/dist/interfaces/IOrderbookFactoryV1';
import { OrderbookCreated } from '@theorderbookdex/orderbook-dex/dist/interfaces/IOrderbookFactory';

export enum OperatorEventType {
    /**
     * Event type dispatched when an order is created.
     */
    ORDER_CREATED = 'orderCreated',

    /**
     * Event type dispatched when an order is updated.
     */
    ORDER_UPDATED = 'orderUpdated',

    /**
     * Event type dispatched when an order is removed.
     */
    ORDER_REMOVED = 'orderRemoved',

    /**
     * Event type dispatched when tokens have been deposited into the operator.
     */
    TOKEN_DEPOSITED = 'tokenDeposited',

    /**
     * Event type dispatched when tokens have been withdrawn from the operator.
     */
    TOKEN_WITHDRAWN = 'tokenWithdrawn',

    /**
     * Event type dispatched after successfully requesting tokens from faucet.
     */
    FAUCET_USED = 'faucetUsed',
}

/**
 * Connection to the Operator smart contract (and to the wallet).
 */
export abstract class Operator extends EventTarget {
    /**
     * Connect to the Operator.
     *
     * @param  requestUserPermission Whether to request user permission to connect to the wallet
     *                               if required. Optional, true by default.
     * @return The connection to the operator.
     * @throws {ChainNotConnected} When connection to the blockchain has not been established.
     * @throws {PermissionToWalletRequired} When the user needs to be asked for permission to
     *                                      connect to the wallet.
     * @throws {RequestRejected} When the user rejects the request.
     * @throws {WalletAddressNotFound} When an address is not provided by the wallet.
     * @throws {OperatorNotCreated} When the user needs to register.
     */
    static async connect(requestUserPermission = true): Promise<Operator> {
        return await OperatorInternal.connect(requestUserPermission);
    }

    /**
     * Create operator and connect.
     *
     * @return The connection to the operator.
     * @throws {ChainNotConnected} When connection to the blockchain has not been established.
     * @throws {RequestRejected} When the user rejects the request.
     * @throws {WalletAddressNotFound} When an address is not provided by the wallet.
     * @throws {OperatorAlreadyCreated} When the operator has been created already.
     */
    static async create(): Promise<Operator> {
        return await OperatorInternal.create();
    }

    /**
     * The connection to the operator.
     */
    static get instance(): Operator {
        return OperatorInternal.instance;
    }

    /**
     * Disconnect from the operator.
     */
    static disconnect(): void {
        OperatorInternal.disconnect();
    }

    /**
     * The address of the wallet.
     */
    abstract get walletAddress(): Address;

    /**
     * The address of the operator.
     */
    abstract get operatorAddress(): Address;

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
     * @param amount      The amount.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
     */
    abstract deposit(token: Token, amount: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Withdraw an amount of tokens from the operator.
     *
     * @param token       The token.
     * @param amount      The amount.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
     */
    abstract withdraw(token: Token, amount: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Call the faucet function of a token.
     *
     * @param token       The token.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
     * @throws {TokenHasNoFaucet} When trying to call the faucet function of a token who
     *                            does not have one.
     * @throws {FaucetOnCooldown} When calling the faucet function of a token fails because
     *                            it's on cooldown.
     */
    abstract faucet(token: Token, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Get the orders of the user.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The orders.
     */
    abstract orders(abortSignal?: AbortSignal): AsyncIterable<Order>;

    /**
     * Get the recent orders of the user.
     *
     * @param count How many orders.
     * @param abortSignal A signal to abort the operation.
     * @returns The recent orders.
     */
    abstract recentOrders(count: number, abortSignal?: AbortSignal): AsyncIterable<Order>;

    /**
     * Get the open orders of the user.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The open orders.
     */
    abstract openOrders(abortSignal?: AbortSignal): AsyncIterable<Order>;

    /**
     * Get the closed orders of the user.
     *
     * @param abortSignal A signal to abort the operation.
     * @returns The closed orders.
     */
    abstract closedOrders(abortSignal?: AbortSignal): AsyncIterable<Order>;

    /**
     * Execute a buy at market operation.
     *
     * @param orderbook     The orderbook.
     * @param maxAmount     The maximum amount of contracts to buy.
     * @param maxPrice      The maximum price to pay for each contract.
     * @param abortSignal   A signal to abort. It won't stop the blockchain transaction, just
     *                      prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
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
     * @throws {RequestRejected} When the user rejects the request.
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
     * @throws {RequestRejected} When the user rejects the request.
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
     * @throws {RequestRejected} When the user rejects the request.
     */
    abstract placeSellOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Claim an order.
     *
     * @param order       The order.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
     */
    abstract claimOrder(order: Order, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Cancel an order.
     *
     * @param order       The order.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
     */
    abstract cancelOrder(order: Order, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Dismiss a closed order.
     *
     * @param order       The order.
     * @param abortSignal A signal to abort.
     *
     * @throws {CannotDismissOrder} When the order is not closed.
     */
    abstract dismissOrder(order: Order, abortSignal?: AbortSignal): Promise<void>;

    /**
     * Create a new orderbook.
     *
     * @param properties The properties of the new orderbook.
     * @param abortSignal A signal to abort. It won't stop the blockchain transaction, just
     *                    prevent the promise from returning.
     * @throws {RequestRejected} When the user rejects the request.
     */
    abstract createOrderbook(properties: OrderbookProperties, abortSignal?: AbortSignal): Promise<Orderbook>;

    addEventListener(type: OperatorEventType.ORDER_CREATED, callback: GenericEventListener<OrderCreatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OperatorEventType.ORDER_UPDATED, callback: GenericEventListener<OrderUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OperatorEventType.ORDER_REMOVED, callback: GenericEventListener<OrderRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OperatorEventType.TOKEN_DEPOSITED, callback: GenericEventListener<TokenDepositedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OperatorEventType.TOKEN_WITHDRAWN, callback: GenericEventListener<TokenWithdrawnEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OperatorEventType.FAUCET_USED, callback: GenericEventListener<FaucetUsedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: OperatorEventType, callback: GenericEventListener<OperatorEvent> | null, options?: boolean | AddEventListenerOptions): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: OperatorEventType.ORDER_CREATED, callback: GenericEventListener<OrderCreatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OperatorEventType.ORDER_UPDATED, callback: GenericEventListener<OrderUpdatedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OperatorEventType.ORDER_REMOVED, callback: GenericEventListener<OrderRemovedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OperatorEventType.TOKEN_DEPOSITED, callback: GenericEventListener<TokenDepositedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OperatorEventType.TOKEN_WITHDRAWN, callback: GenericEventListener<TokenWithdrawnEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OperatorEventType.FAUCET_USED, callback: GenericEventListener<FaucetUsedEvent> | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: OperatorEventType, callback: GenericEventListener<OperatorEvent> | null, options?: boolean | EventListenerOptions): void {
        super.removeEventListener(type, callback, options);
    }

    dispatchEvent(event: OperatorEvent): boolean {
        return super.dispatchEvent(event);
    }

    protected constructor() {
        super();
    }
}

export interface TokenBalance {
    wallet: bigint;
    operator: bigint;
}

export interface OrderbookProperties {
    /**
     * The traded token.
     */
    readonly tradedToken: Token;

    /**
     * The base token.
     */
    readonly baseToken: Token;

    /**
     * The size of a contract in traded token.
     */
    readonly contractSize: bigint;

    /**
     * The price tick in base token.
     */
    readonly priceTick: bigint;
}

export class OperatorInternal extends Operator {
    private static _instance?: OperatorInternal;

    static async connect(requestUserPermission: boolean): Promise<OperatorInternal> {
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
                if (isUserRejectionError(error)) {
                    throw new RequestRejected();
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
                throw new OperatorNotCreated();
            }
            this._instance = new OperatorInternal(accounts[0] as Address, operator as Address);
            APIEvents.instance.dispatchEvent(new WalletConnectedEvent());
        }
        return this._instance;
    }

    static async create(): Promise<OperatorInternal> {
        if (this._instance) {
            throw new OperatorAlreadyCreated();
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
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
        if (!accounts.length) throw new WalletAddressNotFound();
        if (await operatorFactory.operator(accounts[0]) != ZERO_ADDRESS) {
            throw new OperatorAlreadyCreated();
        }
        if (ChainInternal.instance.chainId == 1337) {
            await getDevChainFunds();
        }
        try {
            await operatorFactory.createOperator(10000n);
        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
        const operator = await operatorFactory.operator(accounts[0]);
        this._instance = new OperatorInternal(accounts[0] as Address, operator as Address);
        APIEvents.instance.dispatchEvent(new WalletConnectedEvent());
        return this._instance;
    }

    static disconnect() {
        if (this._instance) {
            this._instance.abortController.abort();
            delete this._instance;
        }
    }

    static get instance(): OperatorInternal {
        if (!this._instance) {
            throw new OperatorNotConnected();
        }
        return this._instance;
    }

    private readonly abortController = new AbortController();

    constructor(
        public readonly walletAddress: Address,
        public readonly operatorAddress: Address,
    ) {
        super();
        void (async () => {
            for await (const order of this.openOrders(this.abortController.signal)) {
                this.trackOrder(order);
            }
        })();
    }

    async getBalance(token: Token, abortSignal?: AbortSignal) {
        const contract = IERC20.at(token.address);
        const wallet = await contract.balanceOf(this.walletAddress, { abortSignal });
        const operator = await contract.balanceOf(this.operatorAddress, { abortSignal });
        return { wallet, operator };
    }

    async deposit(token: Token, amount: bigint, abortSignal?: AbortSignal) {
        const tokenContract = IERC20.at(token.address);
        const sender = this.walletAddress
        const operator = this.operatorAddress;

        try {
            if (await tokenContract.balanceOf(sender, { abortSignal }) < amount) {
                throw new InsufficientFunds();
            }

            // we don't abort here since the tx might still execute
            await tokenContract.transfer(operator, amount);
            this.dispatchEvent(new TokenDepositedEvent(token, amount));

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;

        } finally {
            // since we called some functions without the abort signal we have to check it here

            // eslint-disable-next-line no-unsafe-finally
            if (abortSignal?.aborted) throw abortSignal.reason;
        }
    }

    async withdraw(token: Token, amount: bigint, abortSignal?: AbortSignal) {
        const tokenContract = IERC20.at(token.address);
        const operator = IOperatorV1.at(this.operatorAddress);

        try {
            if (await tokenContract.balanceOf(operator, { abortSignal }) < amount) {
                throw new InsufficientFunds();
            }

            // we don't abort here since the tx might still execute
            await operator.withdrawERC20([ [ token, amount ] ]);
            this.dispatchEvent(new TokenWithdrawnEvent(token, amount));

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;

        } finally {
            // since we called some functions without the abort signal we have to check it here

            // eslint-disable-next-line no-unsafe-finally
            if (abortSignal?.aborted) throw abortSignal.reason;
        }
    }

    async faucet(token: Token, abortSignal?: AbortSignal) {
        if (!token.hasFaucet) {
            throw new TokenHasNoFaucet();
        }

        const tokenContract = IERC20WithFaucet.at(token.address);

        try {
            // call static to catch errors
            await tokenContract.callStatic.faucet({ abortSignal });

            // we don't abort here since the tx might still execute
            await tokenContract.faucet();
            this.dispatchEvent(new FaucetUsedEvent(token));

        } catch (error) {
            if (error instanceof FaucetOnCooldownContractError) {
                throw new FaucetOnCooldown();

            } else if (isUserRejectionError(error)) {
                throw new RequestRejected();

            } else {
                throw error;
            }

        } finally {
            // since we called some functions without the abort signal we have to check it here

            // eslint-disable-next-line no-unsafe-finally
            if (abortSignal?.aborted) throw abortSignal.reason;
        }
    }

    private trackOrder(order: OrderInternal) {
        void (async () => {
            const abortController = createSubAbortController(this.abortController.signal);
            const abortSignal = abortController.signal;

            // abort and retrack when order gets updated
            this.addEventListener(OperatorEventType.ORDER_UPDATED, event => {
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
        const { events } = await Transaction.get(order.txHash, abortSignal);

        order = { ...order, txHash: '' };

        for (const event of events) {
            if (event instanceof BoughtAtMarketV1) {
                order = {
                    ...order,
                    filled: event.amountBought,
                    claimed: event.amountBought,
                    totalPrice: event.amountPaid,
                    totalPriceClaimed: event.amountPaid,
                };

            } else if (event instanceof SoldAtMarketV1) {
                order = {
                    ...order,
                    filled: event.amountSold,
                    claimed: event.amountSold,
                    totalPrice: event.amountReceived,
                    totalPriceClaimed: event.amountReceived,
                };

            } else if (event instanceof PlacedBuyOrderV1) {
                order = {
                    ...order,
                    id: event.orderId,
                };

            } else if (event instanceof PlacedSellOrderV1) {
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
        const { price, id } = order;
        const type = encodeOrderType(order.type);
        const orderbook = IOrderbookV1.at(order.orderbook.address);

        const updateOrder = async () => {
            const { totalFilled } = await orderbook.pricePoint(type, price, { abortSignal });

            const { owner, totalPlacedBeforeOrder, amount: placedAmount } = await orderbook.order(type, price, id, { abortSignal });

            if (!owner) {
                order = {
                    ...order,
                    id: 0n,
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
        const { events } = await Transaction.get(order.claimTxHash, abortSignal);

        order = { ...order, claimTxHash: '' };

        for (const event of events) {
            if (event instanceof OrderClaimedV1) {
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
        const { events } = await Transaction.get(order.cancelTxHash, abortSignal);

        order = { ...order, cancelTxHash: '' };

        for (const event of events) {
            if (event instanceof OrderCanceledV1) {
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

    async * orders(abortSignal?: AbortSignal) {
        for (const order of await Database.instance.getOrders(this.operatorAddress, abortSignal)) {
            yield {
                ...order,
                orderbook: await OrderbookDEX.instance.getOrderbook(order.orderbook, abortSignal),
            };
        }
    }

    async * recentOrders(count: number, abortSignal?: AbortSignal) {
        for (const order of await Database.instance.getRecentOrders(this.operatorAddress, count, abortSignal)) {
            yield {
                ...order,
                orderbook: await OrderbookDEX.instance.getOrderbook(order.orderbook, abortSignal),
            };
        }
    }

    async * openOrders(abortSignal?: AbortSignal) {
        for (const order of await Database.instance.getOpenOrders(this.operatorAddress, abortSignal)) {
            yield {
                ...order,
                orderbook: await OrderbookDEX.instance.getOrderbook(order.orderbook, abortSignal),
            };
        }
    }

    async * closedOrders(abortSignal?: AbortSignal) {
        for (const order of await Database.instance.getClosedOrders(this.operatorAddress, abortSignal)) {
            yield {
                ...order,
                orderbook: await OrderbookDEX.instance.getOrderbook(order.orderbook, abortSignal),
            };
        }
    }

    private async createOrder(txHash: string, orderbook: Orderbook, type: OrderType, execution: OrderExecutionType, price: bigint, amount: bigint, abortSignal?: AbortSignal) {
        try {
            const order = updateOrderStatus({
                key: txHash,
                owner: this.operatorAddress,
                orderbook,
                txHash,
                id: 0n,
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

            // we don't abort here because the order might get saved anyway
            await Database.instance.saveOrder({ ...order, orderbook: order.orderbook.address });
            this.dispatchEvent(new OrderCreatedEvent(order));
            this.trackOrder(order);

        } finally {
            // we need to check the abort signal before continuing

            // eslint-disable-next-line no-unsafe-finally
            if (abortSignal?.aborted) throw abortSignal.reason;
        }
    }

    private async saveOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        try {
            order = updateOrderStatus(order);

            // we don't abort here because the order might get saved anyway
            await Database.instance.saveOrder({ ...order, orderbook: order.orderbook.address });
            this.dispatchEvent(new OrderUpdatedEvent(order));

        } finally {
            // we need to check the abort signal before continuing

            // eslint-disable-next-line no-unsafe-finally
            if (abortSignal?.aborted) throw abortSignal.reason;
        }
    }

    private async refreshOrder(order: OrderInternal) {
        const refreshedOrder = await Database.instance.getOrder(order.key);
        return {
            ...refreshedOrder,
            orderbook: await OrderbookDEX.instance.getOrderbook(refreshedOrder.orderbook),
        };
    }

    async buyAtMarket(orderbook: Orderbook, maxAmount: bigint, maxPrice: bigint, abortSignal?: AbortSignal) {
        const operator = IOperatorV1.at(this.operatorAddress);
        const baseToken = IERC20.at(orderbook.baseToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;

        try {
            // TODO estimate gas for transaction

            if (await baseToken.balanceOf(operator, { abortSignal }) < maxAmount * maxPrice) {
                throw new InsufficientFunds();
            }

            // TODO check for more errors before sending transaction

            // we don't abort here since the tx might still execute
            const hash = await operator.sendTransaction.buyAtMarketV1(orderbook.address, maxAmount, maxPrice, maxPricePoints);
            // the abort signal is checked here
            await this.createOrder(hash, orderbook, OrderType.BUY, OrderExecutionType.MARKET, maxPrice, maxAmount, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
    }

    async sellAtMarket(orderbook: Orderbook, maxAmount: bigint, minPrice: bigint, abortSignal?: AbortSignal) {
        const operator = IOperatorV1.at(this.operatorAddress);
        const tradedToken = IERC20.at(orderbook.tradedToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;

        try {
            // TODO estimate gas for transaction

            if (await tradedToken.balanceOf(operator, { abortSignal }) < maxAmount * orderbook.contractSize) {
                throw new InsufficientFunds();
            }

            // TODO check for more errors before sending transaction

            // we don't abort here since the tx might still execute
            const hash = await operator.sendTransaction.sellAtMarketV1(orderbook.address, maxAmount, minPrice, maxPricePoints);
            // the abort signal is checked here
            await this.createOrder(hash, orderbook, OrderType.SELL, OrderExecutionType.MARKET, minPrice, maxAmount, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
    }

    async placeBuyOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal) {
        const operator = IOperatorV1.at(this.operatorAddress);
        const baseToken = IERC20.at(orderbook.baseToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;

        try {
            // TODO estimate gas for transaction

            if (await baseToken.balanceOf(operator, { abortSignal }) < maxAmount * price) {
                throw new InsufficientFunds();
            }

            // TODO check for more errors before sending transaction

            // we don't abort here since the tx might still execute
            const hash = await operator.sendTransaction.placeBuyOrderV1(orderbook.address, maxAmount, price, maxPricePoints);
            // the abort signal is checked here
            await this.createOrder(hash, orderbook, OrderType.BUY, OrderExecutionType.LIMIT, price, maxAmount, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
    }

    async placeSellOrder(orderbook: Orderbook, maxAmount: bigint, price: bigint, abortSignal?: AbortSignal) {
        const operator = IOperatorV1.at(this.operatorAddress);
        const tradedToken = IERC20.at(orderbook.tradedToken.address);
        // TODO allow user to configure maxPricePoints
        const maxPricePoints = 255;

        try {
            // TODO estimate gas for transaction

            if (await tradedToken.balanceOf(operator, { abortSignal }) < maxAmount * orderbook.contractSize) {
                throw new InsufficientFunds();
            }

            // TODO check for more errors before sending transaction

            // we don't abort here since the tx might still execute
            const hash = await operator.sendTransaction.placeSellOrderV1(orderbook.address, maxAmount, price, maxPricePoints);
            // the abort signal is checked here
            await this.createOrder(hash, orderbook, OrderType.SELL, OrderExecutionType.LIMIT, price, maxAmount, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
    }

    async claimOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        const operator = IOperatorV1.at(this.operatorAddress);
        const maxAmount = MAX_UINT32;

        try {
            const { orderbook, price, id } = order;
            const type = encodeOrderType(order.type);
            // we don't abort here since the tx might still execute
            const claimTxHash = await operator.sendTransaction.claimOrderV1(orderbook, type, price, id, maxAmount);
            order = await this.refreshOrder(order);
            order = { ...order, claimTxHash };
            // the abort signal is checked here
            await this.saveOrder(order, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
    }

    async cancelOrder(order: OrderInternal, abortSignal?: AbortSignal) {
        const operator = IOperatorV1.at(this.operatorAddress);
        // TODO allow user to configure maxLastOrderId
        const maxLastOrderId = MAX_UINT32;

        try {
            const { orderbook, price, id } = order;
            const type = encodeOrderType(order.type);

            // we don't abort here since the tx might still execute
            const cancelTxHash = await operator.sendTransaction.cancelOrderV1(orderbook, type, price, id, maxLastOrderId);
            order = await this.refreshOrder(order);
            order = { ...order, cancelTxHash };
            // the abort signal is checked here
            await this.saveOrder(order, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
    }

    async dismissOrder(order: OrderInternal, abortSignal?: AbortSignal): Promise<void> {
        if (!order.status.includes(OrderStatus.CLOSED)) {
            throw new CannotDismissOrder();
        }

        try {
            // we don't abort here since the order might still get deleted
            await Database.instance.deleteOrder(order.key);
            this.dispatchEvent(new OrderRemovedEvent(order));

        } finally {
            // we need to check the abort signal before continuing

            // eslint-disable-next-line no-unsafe-finally
            if (abortSignal?.aborted) throw abortSignal.reason;
        }
    }

    async createOrderbook(properties: OrderbookProperties, abortSignal?: AbortSignal): Promise<Orderbook> {
        const { tradedToken, baseToken, contractSize, priceTick } = properties;

        const factory = IOrderbookFactoryV1.at(OrderbookDEXInternal.instance._config.orderbookFactoryV1);

        try {
            // call static to catch errors
            await factory.callStatic.createOrderbook(tradedToken, baseToken, contractSize, priceTick, { abortSignal });
            const { events } = await factory.createOrderbook(tradedToken, baseToken, contractSize, priceTick, { abortSignal });
            const [ { orderbook } ] = events.filter(event => event instanceof OrderbookCreated) as OrderbookCreated[];
            return await OrderbookDEX.instance.getOrderbook(orderbook as Address, abortSignal);

        } catch (error) {
            if (isUserRejectionError(error)) {
                throw new RequestRejected();
            }
            throw error;
        }
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
export abstract class OperatorEvent extends Event {
    constructor(type: OperatorEventType) {
        super(type);
    }
}

/**
 * Event dispatched when an order is created.
 */
export class OrderCreatedEvent extends OperatorEvent {
    constructor(readonly order: Order) {
        super(OperatorEventType.ORDER_CREATED);
    }
}

/**
 * Event dispatched when an order is updated.
 */
export class OrderUpdatedEvent extends OperatorEvent {
    constructor(readonly order: Order) {
        super(OperatorEventType.ORDER_UPDATED);
    }
}

/**
 * Event dispatched when an order is removed.
 */
export class OrderRemovedEvent extends OperatorEvent {
    constructor(readonly order: Order) {
        super(OperatorEventType.ORDER_REMOVED);
    }
}

/**
 * Event dispatched when tokens have been deposited into the operator.
 */
export class TokenDepositedEvent extends OperatorEvent {
    constructor(readonly token: Token, readonly amount: bigint) {
        super(OperatorEventType.TOKEN_DEPOSITED);
    }
}

/**
 * Event dispatched when tokens have been withdrawn from the operator.
 */
export class TokenWithdrawnEvent extends OperatorEvent {
    constructor(readonly token: Token, readonly amount: bigint) {
        super(OperatorEventType.TOKEN_WITHDRAWN);
    }
}

/**
 * Event dispatched after successfully requesting tokens from faucet.
 */
export class FaucetUsedEvent extends OperatorEvent {
    constructor(readonly token: Token) {
        super(OperatorEventType.FAUCET_USED);
    }
}

/**
 * Error thrown when the user needs to be asked for permission to connect to the wallet.
 */
export class PermissionToWalletRequired extends Error {
    constructor() {
        super('User Permission To Wallet Required');
        this.name = 'UserPermissionToWalletRequired';
    }
}

/**
 * Error thrown when the user rejected the request.
 */
export class RequestRejected extends Error {
    constructor() {
        super('Request Rejected');
        this.name = 'RequestRejected';
    }
}

/**
 * Error thrown when trying to access the operator before it is connected.
 */
export class OperatorNotConnected extends Error {
    constructor() {
        super('Operator Not Connected');
        this.name = 'OperatorNotConnected';
    }
}

/**
 * Error thrown when a wallet address is not provided.
 *
 * This probably means that the user has not generated their account.
 */
export class WalletAddressNotFound extends Error {
    constructor() {
        super('Wallet Address Not Found');
        this.name = 'WalletAddressNotFound';
    }
}

/**
 * Error thrown when the operator has not been created yet.
 */
export class OperatorNotCreated extends Error {
    constructor() {
        super('Operator Not Created');
        this.name = 'OperatorNotCreated';
    }
}

/**
 * Error thrown when the operator has been created already.
 */
export class OperatorAlreadyCreated extends Error {
    constructor() {
        super('Operator Already Created');
        this.name = 'OperatorAlreadyCreated';
    }
}

/**
 * Error thrown when there are not sufficient funds for an operation.
 */
export class InsufficientFunds extends Error {
    constructor() {
        super('Insufficient Funds');
        this.name = 'InsufficientFunds';
    }
}

/**
 * Error thrown when an order cannot be dismissed.
 */
export class CannotDismissOrder extends Error {
    constructor() {
        super('Cannot Dismiss Order');
        this.name = 'CannotDismissOrder';
    }
}

/**
 * Error thrown when trying to call the faucet function of a token who does not have one.
 */
export class TokenHasNoFaucet extends Error {
    constructor() {
        super('Token Has No Faucet');
        this.name = 'TokenHasNoFaucet';
    }
}

/**
 * Error thrown when calling the faucet function of a token fails because it's on cooldown.
 */
export class FaucetOnCooldown extends Error {
    constructor() {
        super('Faucet On Cooldown');
        this.name = 'FaucetOnCooldown';
    }
}
