import { CosmosClient, Container, Database } from '@azure/cosmos';
import { Logger } from './logger.service';
import * as userIndexes from '../schemas/database/indexes/users.index.json';
import * as transactionIndexes from '../schemas/database/indexes/transactions.index.json';
import * as walletIndexes from '../schemas/database/indexes/wallets.index.json';

export class DatabaseService {
    private static instance: DatabaseService;
    private database: Database;
    private readonly logger: Logger;

    private constructor(
        private readonly client: CosmosClient,
        logger: Logger
    ) {
        this.logger = logger;
    }

    static async initialize(
        client: CosmosClient,
        logger: Logger
    ): Promise<DatabaseService> {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService(client, logger);
            await DatabaseService.instance.initializeDatabase();
        }
        return DatabaseService.instance;
    }

    private async initializeDatabase() {
        try {
            // Create database if it doesn't exist
            const { database } = await this.client.databases.createIfNotExists({
                id: 'xrwebsites-db-2024'
            });
            this.database = database;

            // Initialize containers with indexes
            await Promise.all([
                this.initializeContainer('users', userIndexes),
                this.initializeContainer('transactions', transactionIndexes),
                this.initializeContainer('wallets', walletIndexes)
            ]);

            console.log('Database and containers initialized successfully');
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'DatabaseService',
                operation: 'initializeDatabase'
            });
            throw error;
        }
    }

    private async initializeContainer(
        containerId: string,
        indexPolicy: any
    ): Promise<Container> {
        try {
            console.log(`Initializing container: ${containerId}`);

            // Create container if it doesn't exist
            const { container } = await this.database.containers.createIfNotExists({
                id: containerId,
                partitionKey: { paths: ['/tenantId'] }
            });

            // Apply index policy
            const currentPolicy = (await container.readOffer()).resource.indexingPolicy;
            
            // Only update if policies are different
            if (JSON.stringify(currentPolicy) !== JSON.stringify(indexPolicy.indexingPolicy)) {
                console.log(`Updating index policy for ${containerId}`);
                
                await container.replace({
                    id: containerId,
                    partitionKey: { paths: ['/tenantId'] },
                    indexingPolicy: indexPolicy.indexingPolicy
                });

                // Wait for indexing to complete
                await this.waitForIndexing(container);
            }

            return container;
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'DatabaseService',
                operation: 'initializeContainer',
                containerId
            });
            throw error;
        }
    }

    private async waitForIndexing(container: Container): Promise<void> {
        let isIndexing = true;
        while (isIndexing) {
            const response = await container.readOffer();
            isIndexing = response.resource.indexTransformationProgress < 100;
            if (isIndexing) {
                console.log(`Indexing progress: ${response.resource.indexTransformationProgress}%`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        console.log('Indexing completed');
    }

    // Helper method to get container
    async getContainer(containerId: string): Promise<Container> {
        return this.database.container(containerId);
    }

    // Method to check index progress
    async checkIndexProgress(containerId: string): Promise<number> {
        const container = await this.getContainer(containerId);
        const response = await container.readOffer();
        return response.resource.indexTransformationProgress;
    }
} 