import { CosmosClient, Container, Database } from '@azure/cosmos';
import { Logger } from './logger.service';
import { getIndexingPolicy } from '../config/indexing.config';

export class IndexingService {
    private static instance: IndexingService;
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
    ): Promise<IndexingService> {
        if (!IndexingService.instance) {
            IndexingService.instance = new IndexingService(client, logger);
            await IndexingService.instance.initializeDatabase();
        }
        return IndexingService.instance;
    }

    private async initializeDatabase() {
        const { database } = await this.client.databases.createIfNotExists({
            id: 'xrwebsites-db-2024'
        });
        this.database = database;
    }

    async applyIndexingPolicies(collections: string[] = ['users', 'transactions', 'wallets']) {
        console.log('Starting index policy application...');
        
        for (const collectionName of collections) {
            await this.applyCollectionIndexing(collectionName);
        }

        console.log('Index policy application completed');
    }

    private async applyCollectionIndexing(collectionName: string) {
        try {
            console.log(`Applying index policy to ${collectionName}...`);

            // Get or create container
            const { container } = await this.database.containers.createIfNotExists({
                id: collectionName,
                partitionKey: { paths: ['/tenantId'] }
            });

            // Get new policy
            const newPolicy = getIndexingPolicy(collectionName);

            // Get current policy
            const currentPolicy = (await container.readOffer()).resource.indexingPolicy;

            // Compare policies
            if (this.shouldUpdatePolicy(currentPolicy, newPolicy)) {
                await this.updateContainerPolicy(container, collectionName, newPolicy);
            } else {
                console.log(`No policy update needed for ${collectionName}`);
            }

        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'IndexingService',
                operation: 'applyCollectionIndexing',
                collection: collectionName
            });
            throw error;
        }
    }

    private shouldUpdatePolicy(current: any, newPolicy: any): boolean {
        // Remove transformation progress from comparison
        const cleanCurrent = { ...current };
        delete cleanCurrent.indexTransformationProgress;
        
        return JSON.stringify(cleanCurrent) !== JSON.stringify(newPolicy);
    }

    private async updateContainerPolicy(
        container: Container,
        collectionName: string,
        policy: any
    ) {
        console.log(`Updating index policy for ${collectionName}...`);

        // Apply new policy
        await container.replace({
            id: collectionName,
            partitionKey: { paths: ['/tenantId'] },
            indexingPolicy: policy
        });

        // Wait for indexing to complete
        await this.waitForIndexing(container, collectionName);
    }

    private async waitForIndexing(
        container: Container,
        collectionName: string
    ): Promise<void> {
        let isIndexing = true;
        let lastProgress = 0;

        while (isIndexing) {
            const response = await container.readOffer();
            const progress = response.resource.indexTransformationProgress;

            if (progress !== lastProgress) {
                console.log(`${collectionName} indexing progress: ${progress}%`);
                lastProgress = progress;
            }

            isIndexing = progress < 100;

            if (isIndexing) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`${collectionName} indexing completed`);
    }

    async getIndexingStatus(collectionName: string): Promise<{
        progress: number;
        isComplete: boolean;
    }> {
        const container = this.database.container(collectionName);
        const response = await container.readOffer();
        const progress = response.resource.indexTransformationProgress;

        return {
            progress,
            isComplete: progress === 100
        };
    }
} 