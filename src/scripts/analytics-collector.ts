import { CosmosClient } from '@azure/cosmos';
import { AnalyticsCollector } from '../services/analytics-collector.service';
import { Logger } from '../services/logger.service';
import dotenv from 'dotenv';

dotenv.config();

async function testAnalyticsCollector() {
    let collector: AnalyticsCollector | null = null;
    
    try {
        console.log('Initializing Analytics Collector Test...');

        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        // Clean up previous test data first
        console.log('\nCleaning up previous test data...');
        const container = client.database('xrwebsites-db-2024').container('analytics');
        const { resources: oldEvents } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
                parameters: [{ name: "@tenantId", value: "test-tenant" }]
            })
            .fetchAll();

        for (const event of oldEvents) {
            await container.item(event.id, event.tenantId).delete();
        }
        console.log(`Cleaned up ${oldEvents.length} old events`);

        const logger = await Logger.initialize(client);
        collector = await AnalyticsCollector.initialize(client, logger);

        // Test events
        console.log('\nTesting event tracking...');
        
        await collector.trackUserActivity('test-tenant', 'user1', 'login', { device: 'mobile' });
        await collector.trackAssetInteraction({
            tenantId: 'test-tenant',
            assetId: 'asset1',
            action: 'view',
            category: '3d-model',
            metadata: { timeSpent: 300 }
        });

        // Force process the batch
        console.log('\nProcessing batch...');
        await collector.processBatchNow();

        // Verify data
        console.log('\nVerifying stored events...');
        const { resources: events } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
                parameters: [{ name: "@tenantId", value: "test-tenant" }]
            })
            .fetchAll();

        if (events.length !== 2) {
            throw new Error(`Expected 2 events, found ${events.length}`);
        }

        console.log(`\n✅ Found ${events.length} events as expected`);
        console.log('Analytics Collector Test Completed Successfully');

    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    } finally {
        if (collector) {
            await collector.stopBatchProcessing();
        }
        process.exit(0);
    }
}

testAnalyticsCollector().catch(console.error); 