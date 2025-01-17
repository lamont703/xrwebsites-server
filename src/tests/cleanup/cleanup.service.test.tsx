import { describe, test, expect, beforeAll } from 'vitest';
import { CosmosClient, Container } from '@azure/cosmos';
import { StorageService } from '../../services/storage.service';
import { CleanupService } from '../../services/cleanup.service';
import { Logger } from '../../services/logger.service';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

describe('Cleanup Service Tests', () => {
    let cleanupService: CleanupService;
    let storageService: StorageService;
    let cosmosClient: CosmosClient;
    let logger: Logger;
    let testContainer: Container;

    beforeAll(async () => {
        // Initialize services
        cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        logger = new Logger();
        storageService = await StorageService.initialize(logger);
        cleanupService = await CleanupService.initialize(cosmosClient, storageService, logger);

        // Create test container
        const { database } = await cosmosClient.databases.createIfNotExists({
            id: 'xrwebsites-db-2024'
        });

        const { container } = await database.containers.createIfNotExists({
            id: 'test-cleanup',
            partitionKey: '/tenantId'
        });

        testContainer = container;
    });

    describe('Cleanup Operations', () => {
        test('should archive old documents', async () => {
            // Create test documents with different dates
            const currentDate = new Date();
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 100); // 100 days old

            const testDocs = [
                {
                    id: `current-${Date.now()}`,
                    tenantId: 'test-tenant',
                    type: 'job',
                    status: 'active',
                    createdAt: currentDate.toISOString(),
                    data: { title: 'Current Job' }
                },
                {
                    id: `old-${Date.now()}`,
                    tenantId: 'test-tenant',
                    type: 'job',
                    status: 'completed',
                    createdAt: oldDate.toISOString(),
                    data: { title: 'Old Job' }
                }
            ];

            try {
                // Insert test documents
                for (const doc of testDocs) {
                    await testContainer.items.create(doc);
                }

                // Run cleanup (archive docs older than 90 days)
                await cleanupService.archiveOldData('test-cleanup', 90);

                // Verify old document is archived and new document remains
                const { resources: remainingDocs } = await testContainer.items
                    .query({
                        query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
                        parameters: [{ name: "@tenantId", value: "test-tenant" }]
                    })
                    .fetchAll();

                // Should only have the current document
                expect(remainingDocs.length).toBe(1);
                expect(remainingDocs[0].id).toContain('current-');

                // Verify old document is in blob storage
                const blobClient = storageService.getBlobClient(`test-cleanup/old-${testDocs[1].id}.json`);
                const exists = await blobClient.exists();
                expect(exists).toBe(true);

            } catch (error) {
                console.error('Test Error:', {
                    name: error.name,
                    message: error.message,
                    details: error.stack
                });
                throw error;
            } finally {
                // Cleanup test data
                await testContainer.delete();
            }
        });
    });
}); 