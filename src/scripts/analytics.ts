import { CosmosClient } from '@azure/cosmos';
import { AnalyticsCollector } from '../services/analytics-collector.service';
import { AnalyticsService } from '../services/analytics.service';
import { Logger } from '../services/logger.service';
import { CacheService } from '../services/cache.service';
import dotenv from 'dotenv';

dotenv.config();

async function runAnalyticsTest() {
    let collector: AnalyticsCollector | null = null;
    
    try {
        console.log('\n=== Starting Analytics Test ===');

        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        // Clean up previous test data
        console.log('\n1. Cleaning up previous test data...');
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
        console.log(`✓ Cleaned up ${oldEvents.length} old events`);

        const logger = await Logger.initialize(client);
        const cache = await CacheService.initialize(
            {
                host: process.env.AZURE_REDIS_HOST!,
                key: process.env.AZURE_REDIS_KEY!,
                port: parseInt(process.env.AZURE_REDIS_PORT!) || 6380
            },
            logger
        );

        // Initialize services
        collector = await AnalyticsCollector.initialize(client, logger);
        const analytics = await AnalyticsService.initialize(client, logger, cache);
        console.log('✓ Services initialized');

        // Generate Test Data
        console.log('\n2. Generating test data...');
        
        await collector.trackUserActivity('test-tenant', 'user1', 'login', { device: 'mobile' });
        await collector.trackUserActivity('test-tenant', 'user2', 'login', { device: 'desktop' });
        await collector.trackUserActivity('test-tenant', 'user1', 'view_asset', { assetId: 'asset1' });
        console.log('✓ User activities tracked');

        await collector.trackAssetInteraction({
            tenantId: 'test-tenant',
            assetId: 'asset1',
            action: 'view',
            category: '3d-model',
            metadata: { timeSpent: 300 }
        });
        console.log('✓ Asset interaction tracked');

        await collector.trackJobActivity({
            tenantId: 'test-tenant',
            jobId: 'job1',
            action: 'post',
            category: 'modeling',
            payRate: 100,
            metadata: { urgent: true }
        });
        console.log('✓ Job activity tracked');

        await collector.trackWalletActivity({
            tenantId: 'test-tenant',
            walletId: 'wallet1',
            action: 'deposit',
            amount: 1000,
            currency: 'USD',
            metadata: { method: 'stripe' }
        });
        console.log('✓ Wallet activity tracked');

        // Force process the batch
        console.log('\n3. Processing batch...');
        await collector.processBatchNow();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
        console.log('✓ Batch processed');

        // Verify data was stored
        const { resources: storedEvents } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
                parameters: [{ name: "@tenantId", value: "test-tenant" }]
            })
            .fetchAll();
        console.log(`✓ Found ${storedEvents.length} stored events`);

        // Test Analytics Queries
        console.log('\n4. Testing analytics queries...');

        const userMetrics = await analytics.getUserEngagementMetrics({
            timeframe: 'daily',
            tenantId: 'test-tenant'
        });
        console.log('User Metrics:', userMetrics);

        const assetMetrics = await analytics.getPopularAssets({
            timeframe: 'daily',
            tenantId: 'test-tenant'
        });
        console.log('Asset Metrics:', assetMetrics);

        const jobMetrics = await analytics.getJobBoardMetrics({
            timeframe: 'daily',
            tenantId: 'test-tenant'
        });
        console.log('Job Metrics:', jobMetrics);

        const walletMetrics = await analytics.getWalletMetrics({
            timeframe: 'daily',
            tenantId: 'test-tenant'
        });
        console.log('Wallet Metrics:', walletMetrics);

        // Validate results
        console.log('\n5. Validating results...');
        const validations = [
            { check: userMetrics.totalActions === 3, message: 'User total actions should be 3' },
            { check: assetMetrics[0]?.views === 1, message: 'Asset views should be 1' },
            { check: jobMetrics[0]?.count === 1, message: 'Job count should be 1' },
            { check: walletMetrics[0]?.totalAmount === 1000, message: 'Wallet amount should be 1000' }
        ];

        const failedChecks = validations.filter(v => !v.check);
        if (failedChecks.length > 0) {
            throw new Error('Validation failed:\n' + failedChecks.map(f => f.message).join('\n'));
        }

        console.log('✓ All validations passed');
        console.log('\n=== Analytics Test Completed Successfully ===');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    } finally {
        if (collector) {
            await collector.stopBatchProcessing();
        }
        process.exit(0);
    }
}

runAnalyticsTest().catch(console.error); 