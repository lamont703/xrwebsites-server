import { CosmosClient, Container, FeedResponse } from '@azure/cosmos';
import { CognitiveSearchService } from './cognitive-search.service';
import { Logger } from './logger.service';

export class SyncService {
    private static instance: SyncService;
    private readonly logger: Logger;
    private readonly batchSize = 100;

    private constructor(
        private readonly client: CosmosClient,
        private readonly searchService: CognitiveSearchService,
        logger: Logger
    ) {
        this.logger = logger;
    }

    static async initialize(
        client: CosmosClient,
        searchService: CognitiveSearchService,
        logger: Logger
    ): Promise<SyncService> {
        if (!SyncService.instance) {
            SyncService.instance = new SyncService(client, searchService, logger);
        }
        return SyncService.instance;
    }

    async syncCollection(
        collectionName: string,
        options: {
            fromTimestamp?: string;
            continuationToken?: string;
        } = {}
    ) {
        try {
            console.log(`Starting sync for collection: ${collectionName}`);
            const container = this.client
                .database('xrwebsites-db-2024')
                .container(collectionName);

            let continuationToken = options.continuationToken;
            let totalProcessed = 0;
            let hasMore = true;

            while (hasMore) {
                const { documents, token, count } = await this.fetchBatch(
                    container,
                    options.fromTimestamp,
                    continuationToken
                );

                if (documents.length > 0) {
                    await this.processBatch(documents, collectionName);
                    totalProcessed += count;
                    console.log(`Processed ${totalProcessed} documents`);
                }

                continuationToken = token;
                hasMore = !!continuationToken;
            }

            console.log(`Sync completed for ${collectionName}. Total processed: ${totalProcessed}`);
            return totalProcessed;

        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'SyncService',
                operation: 'syncCollection',
                collection: collectionName
            });
            throw error;
        }
    }

    private async fetchBatch(
        container: Container,
        fromTimestamp?: string,
        continuationToken?: string
    ): Promise<{
        documents: any[];
        token?: string;
        count: number;
    }> {
        let query = 'SELECT * FROM c';
        const parameters: any[] = [];

        if (fromTimestamp) {
            query += ' WHERE c._ts >= @timestamp';
            parameters.push({
                name: '@timestamp',
                value: new Date(fromTimestamp).getTime() / 1000
            });
        }

        const queryResponse: FeedResponse<any> = await container.items
            .query({
                query,
                parameters
            }, {
                maxItemCount: this.batchSize,
                continuationToken
            })
            .fetchNext();

        return {
            documents: queryResponse.resources,
            token: queryResponse.continuationToken,
            count: queryResponse.resources.length
        };
    }

    private async processBatch(documents: any[], collectionType: string) {
        const searchDocuments = documents.map(doc => this.transformToSearchDocument(doc, collectionType));
        
        const chunks = this.chunkArray(searchDocuments, 1000); // Azure Search limit
        
        for (const chunk of chunks) {
            try {
                await Promise.all(chunk.map(doc => 
                    this.searchService.indexDocument(doc)
                ));
            } catch (error) {
                await this.logger.logError('system', error as Error, {
                    component: 'SyncService',
                    operation: 'processBatch',
                    collection: collectionType
                });
                throw error;
            }
        }
    }

    private transformToSearchDocument(doc: any, type: string) {
        const baseDocument = {
            id: doc.id,
            tenantId: doc.tenantId,
            type,
            createdAt: doc.createdAt || doc.timestamp || new Date().toISOString()
        };

        switch (type) {
            case 'users':
                return {
                    ...baseDocument,
                    content: `${doc.email} ${doc.username || ''} ${doc.firstName || ''} ${doc.lastName || ''}`,
                    tags: [doc.role, doc.status],
                };

            case 'transactions':
                return {
                    ...baseDocument,
                    content: `Transaction ${doc.id} - Amount: ${doc.amount} - Status: ${doc.status}`,
                    tags: [doc.type, doc.status],
                    amount: doc.amount
                };

            case 'wallets':
                return {
                    ...baseDocument,
                    content: `Wallet ${doc.id} - Balance: ${doc.balance} - Status: ${doc.status}`,
                    tags: [doc.status],
                    balance: doc.balance
                };

            default:
                return {
                    ...baseDocument,
                    content: JSON.stringify(doc)
                };
        }
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
            array.slice(i * size, (i + 1) * size)
        );
    }

    // Change feed processor for real-time sync
    async startChangeFeedProcessor(collectionName: string) {
        const container = this.client
            .database('xrwebsites-db-2024')
            .container(collectionName);

        const leaseContainer = await this.ensureLeaseContainer();

        const processor = container.changeFeed.getChangeFeedProcessorBuilder<any>(
            `${collectionName}Processor`,
            async (changes) => {
                for (const change of changes) {
                    const searchDoc = this.transformToSearchDocument(change, collectionName);
                    await this.searchService.indexDocument(searchDoc);
                }
            })
            .withLeaseContainer(leaseContainer)
            .build();

        await processor.start();
        console.log(`Change feed processor started for ${collectionName}`);
        
        return processor;
    }

    private async ensureLeaseContainer() {
        const { container } = await this.client
            .database('xrwebsites-db-2024')
            .containers.createIfNotExists({
                id: 'search-sync-leases',
                partitionKey: { paths: ['/id'] }
            });
        
        return container;
    }
} 