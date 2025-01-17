import { CosmosClient, Container } from '@azure/cosmos';
import { StorageService } from './storage.service';
import { Logger } from './logger.service';

export class CleanupService {
    private client: CosmosClient;
    private storageService: StorageService;
    private logger: Logger;

    static async initialize(
        client: CosmosClient,
        storageService: StorageService,
        logger: Logger
    ): Promise<CleanupService> {
        const service = new CleanupService();
        service.client = client;
        service.storageService = storageService;
        service.logger = logger;
        return service;
    }

    async archiveOldData(collection: string, olderThanDays: number): Promise<void> {
        const container = this.client.database('xrwebsites-db-2024').container(collection);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        console.log(`Archiving documents older than: ${cutoffDate.toISOString()}`);

        // NoSQL specific query - handle different date field names
        const query = {
            query: "SELECT * FROM c WHERE c.createdAt < @cutoffDate OR c.created < @cutoffDate OR c.timestamp < @cutoffDate OR c._ts < @cutoffTimestamp",
            parameters: [
                { name: "@cutoffDate", value: cutoffDate.toISOString() },
                { name: "@cutoffTimestamp", value: Math.floor(cutoffDate.getTime() / 1000) }
            ]
        };

        try {
            console.log(`Executing query for ${collection}:`, query);

            const { resources: documents } = await container.items.query(query).fetchAll();
            console.log(`Found ${documents.length} documents to archive in ${collection}`);

            for (const doc of documents) {
                try {
                    // Log document structure for debugging
                    console.log('Processing document:', {
                        id: doc.id,
                        tenantId: doc.tenantId,
                        dateFields: {
                            createdAt: doc.createdAt,
                            created: doc.created,
                            timestamp: doc.timestamp,
                            _ts: doc._ts
                        }
                    });

                    // Archive to blob storage
                    const archivePath = await this.storageService.archiveDocument(
                        collection, 
                        {
                            ...doc,
                            _archived: new Date().toISOString(),
                            _originalCollection: collection
                        }
                    );
                    
                    // Delete from Cosmos DB using partition key
                    await container.item(doc.id, doc.tenantId).delete();

                    await this.logger.log({
                        tenantId: doc.tenantId || 'system',
                        eventType: 'data.archived',
                        severity: 'info',
                        target: {
                            id: doc.id,
                            type: collection,
                            archivePath
                        },
                        metadata: {
                            originalCreatedAt: doc.createdAt || doc.created || doc.timestamp,
                            archivedAt: new Date().toISOString()
                        }
                    });
                } catch (docError) {
                    // Log error but continue with other documents
                    await this.logger.logError(doc.tenantId || 'system', docError as Error, {
                        component: 'CleanupService',
                        operation: 'archiveDocument',
                        documentId: doc.id,
                        collection
                    });
                }
            }
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CleanupService',
                operation: 'archiveOldData',
                collection
            });
            throw error;
        }
    }
} 