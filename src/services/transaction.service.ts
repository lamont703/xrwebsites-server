import { Container, CosmosClient } from '@azure/cosmos';
import { Logger } from './logger.service';
import { CacheService } from './cache.service';

interface Wallet {
    id: string;
    tenantId: string;
    userId: string;
    balance: number;
    status: 'active' | 'frozen' | 'closed';
    createdAt: string;
    lastUpdated: string;
}

interface Transaction {
    id: string;
    tenantId: string;
    type: 'transfer' | 'deposit' | 'withdrawal';
    status: 'pending' | 'completed' | 'failed';
    amount: number;
    timestamp: string;
    from?: { userId: string; walletId: string; };
    to: { userId: string; walletId: string; };
    metadata?: Record<string, any>;
    lastUpdated: string;
    errorDetails?: { message: string; timestamp: string; };
}

interface ItemResponse<T> {
    resource: T;
    statusCode: number;
}

export class TransactionService {
    private static instance: TransactionService;
    private readonly transactionsContainer: Container;
    private readonly walletsContainer: Container;
    private readonly logger: Logger;
    private readonly cache: CacheService;

    private constructor(
        transactionsContainer: Container,
        walletsContainer: Container,
        logger: Logger,
        cache: CacheService
    ) {
        this.transactionsContainer = transactionsContainer;
        this.walletsContainer = walletsContainer;
        this.logger = logger;
        this.cache = cache;
    }

    static async initialize(
        client: CosmosClient,
        logger: Logger,
        cache: CacheService
    ): Promise<TransactionService> {
        if (!TransactionService.instance) {
            // First create database if it doesn't exist
            const { database } = await client.databases.createIfNotExists({
                id: 'xrwebsites-db-2024'
            });

            // Then create containers
            const [transactionsContainer, walletsContainer] = await Promise.all([
                database.containers.createIfNotExists({
                    id: 'transactions',
                    partitionKey: { paths: ["/tenantId"] }
                }),
                database.containers.createIfNotExists({
                    id: 'wallets',
                    partitionKey: { paths: ["/tenantId"] }
                })
            ]);

            TransactionService.instance = new TransactionService(
                transactionsContainer.container,
                walletsContainer.container,
                logger,
                cache
            );
        }
        return TransactionService.instance;
    }

    async createWallet(tenantId: string, userId: string): Promise<Wallet> {
        const wallet: Wallet = {
            id: `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tenantId,
            userId,
            balance: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        const { resource } = await this.walletsContainer.items.create(wallet);
        return resource as Wallet;
    }

    async getWallet(tenantId: string, userId: string): Promise<Wallet | null> {
        const cachedWallet = await this.cache.get(`wallet:${userId}`, tenantId);
        if (cachedWallet) return cachedWallet as Wallet;

        const { resources } = await this.walletsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userId = @userId",
                parameters: [
                    { name: "@tenantId", value: tenantId },
                    { name: "@userId", value: userId }
                ]
            })
            .fetchAll();

        const wallet = resources[0] as Wallet;
        if (wallet) {
            await this.cache.set(`wallet:${userId}`, wallet, tenantId);
        }
        return wallet || null;
    }

    async deposit(
        tenantId: string,
        userId: string,
        amount: number,
        type: string,
        metadata?: Record<string, any>
    ): Promise<Transaction> {
        if (amount <= 0) throw new Error('Invalid amount');

        const wallet = await this.getWallet(tenantId, userId);
        if (!wallet) throw new Error('Wallet not found');

        const transaction: Transaction = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tenantId,
            type: 'deposit',
            status: 'pending',
            amount,
            timestamp: new Date().toISOString(),
            to: { userId, walletId: wallet.id },
            metadata,
            lastUpdated: new Date().toISOString()
        };

        const { resource: tx } = await this.transactionsContainer.items.create(transaction) as unknown as ItemResponse<Transaction>;
        
        try {
            await this.walletsContainer.item(wallet.id, wallet.tenantId).replace({
                ...wallet,
                balance: wallet.balance + amount,
                lastUpdated: new Date().toISOString()
            });

            const finalTx = await this.transactionsContainer.item(tx.id, tx.tenantId).replace({
                ...tx,
                status: 'completed',
                lastUpdated: new Date().toISOString()
            }) as unknown as ItemResponse<Transaction>;

            await this.cache.invalidateByTag(`wallet:${userId}`);
            return finalTx.resource as Transaction;

        } catch (error) {
            await this.transactionsContainer.item(tx.id, tx.tenantId).replace({
                ...tx,
                status: 'failed',
                errorDetails: {
                    message: error.message,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }

    async transfer(
        tenantId: string,
        fromUserId: string,
        toUserId: string,
        amount: number,
        metadata?: Record<string, any>
    ): Promise<Transaction> {
        if (amount <= 0) throw new Error('Invalid amount');
        if (fromUserId === toUserId) throw new Error('Cannot transfer to same wallet');

        const [fromWallet, toWallet] = await Promise.all([
            this.getWallet(tenantId, fromUserId),
            this.getWallet(tenantId, toUserId)
        ]);

        if (!fromWallet || !toWallet) throw new Error('Wallet not found');
        if (fromWallet.balance < amount) throw new Error('Insufficient funds');

        const transaction: Transaction = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tenantId,
            type: 'transfer',
            status: 'pending',
            amount,
            timestamp: new Date().toISOString(),
            from: { userId: fromUserId, walletId: fromWallet.id },
            to: { userId: toUserId, walletId: toWallet.id },
            metadata,
            lastUpdated: new Date().toISOString()
        };

        const { resource: tx } = await this.transactionsContainer.items.create(transaction) as unknown as ItemResponse<Transaction>;

        try {
            await Promise.all([
                this.walletsContainer.item(fromWallet.id, fromWallet.tenantId).replace({
                    ...fromWallet,
                    balance: fromWallet.balance - amount,
                    lastUpdated: new Date().toISOString()
                }),
                this.walletsContainer.item(toWallet.id, toWallet.tenantId).replace({
                    ...toWallet,
                    balance: toWallet.balance + amount,
                    lastUpdated: new Date().toISOString()
                })
            ]);

            const finalTx = await this.transactionsContainer.item(tx.id, tx.tenantId).replace({
                ...tx,
                status: 'completed',
                lastUpdated: new Date().toISOString()
            }) as unknown as ItemResponse<Transaction>;

            await Promise.all([
                this.cache.invalidateByTag(`wallet:${fromUserId}`),
                this.cache.invalidateByTag(`wallet:${toUserId}`)
            ]);

            return finalTx.resource as Transaction;

        } catch (error) {
            await this.transactionsContainer.item(tx.id, tx.tenantId).replace({
                ...tx,
                status: 'failed',
                errorDetails: {
                    message: error.message,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }

    async processBatchTransactions(
        tenantId: string,
        transactions: Array<{
            fromUserId: string;
            toUserId: string;
            amount: number;
            metadata?: Record<string, any>;
        }>
    ): Promise<Transaction[]> {
        const userIds = new Set(transactions.flatMap(t => [t.fromUserId, t.toUserId]));
        const wallets = new Map<string, Wallet>();

        await Promise.all(
            Array.from(userIds).map(async userId => {
                const wallet = await this.getWallet(tenantId, userId);
                if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
                wallets.set(userId, wallet);
            })
        );

        for (const tx of transactions) {
            const wallet = wallets.get(tx.fromUserId)!;
            const totalOutgoing = transactions
                .filter(t => t.fromUserId === tx.fromUserId)
                .reduce((sum, t) => sum + t.amount, 0);

            if (wallet.balance < totalOutgoing) {
                throw new Error(`Insufficient funds for user ${tx.fromUserId}`);
            }
        }

        return Promise.all(
            transactions.map(tx => 
                this.transfer(tenantId, tx.fromUserId, tx.toUserId, tx.amount, tx.metadata)
            )
        );
    }

    async getTransactionHistory(
        tenantId: string,
        userId: string,
        limit = 50
    ): Promise<Transaction[]> {
        const { resources } = await this.transactionsContainer.items
            .query({
                query: `
                    SELECT * FROM c 
                    WHERE c.tenantId = @tenantId 
                    AND (c.from.userId = @userId OR c.to.userId = @userId)
                    ORDER BY c.timestamp DESC
                    OFFSET 0 LIMIT @limit
                `,
                parameters: [
                    { name: "@tenantId", value: tenantId },
                    { name: "@userId", value: userId },
                    { name: "@limit", value: limit }
                ]
            })
            .fetchAll();

        return resources as Transaction[];
    }
}