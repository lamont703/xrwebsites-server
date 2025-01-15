import { CosmosClient } from '@azure/cosmos';
import { CacheService } from '../services/cache.service';
import { Logger } from '../services/logger.service';
import dotenv from 'dotenv';

dotenv.config();

async function testCacheService() {
    try {
        console.log('Starting cache service tests...');

        // Initialize dependencies
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const logger = await Logger.initialize(client);
        const cache = await CacheService.initialize(
            {
                host: process.env.AZURE_REDIS_HOST!,
                key: process.env.AZURE_REDIS_KEY!,
                port: parseInt(process.env.AZURE_REDIS_PORT!) || 6380
            },
            logger
        );

        // Test 1: Basic set and get
        console.log('\n1. Testing basic cache operations...');
        const testData = { id: 1, name: 'Test Asset' };
        await cache.set('test:asset:1', testData, { ttl: 60 });
        const cachedData = await cache.get('test:asset:1');
        console.log('Cached data retrieved:', cachedData);

        // Test 2: Cache with tags
        console.log('\n2. Testing cache tags...');
        const assets = [
            { id: 1, type: 'model', name: 'Asset 1' },
            { id: 2, type: 'texture', name: 'Asset 2' }
        ];

        await Promise.all(
            assets.map(asset => 
                cache.set(
                    `asset:${asset.id}`, 
                    asset, 
                    { tags: ['assets', asset.type] }
                )
            )
        );

        // Test tag-based invalidation
        await cache.invalidateByTag('texture');
        const asset1 = await cache.get('asset:1');
        const asset2 = await cache.get('asset:2');
        console.log('After texture invalidation:', { asset1, asset2 });

        // Test 3: getOrSet functionality
        console.log('\n3. Testing getOrSet...');
        const expensiveOperation = async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { id: 3, name: 'Computed Asset' };
        };

        console.time('First call');
        const result1 = await cache.getOrSet('expensive:1', expensiveOperation);
        console.timeEnd('First call');

        console.time('Second call');
        const result2 = await cache.getOrSet('expensive:1', expensiveOperation);
        console.timeEnd('Second call');

        console.log('Results match:', JSON.stringify(result1) === JSON.stringify(result2));

        // Test 4: Multi-tenant isolation
        console.log('\n4. Testing tenant isolation...');
        await cache.set('shared:data', { value: 'tenant1' }, {}, 'tenant1');
        await cache.set('shared:data', { value: 'tenant2' }, {}, 'tenant2');

        const tenant1Data = await cache.get('shared:data', 'tenant1');
        const tenant2Data = await cache.get('shared:data', 'tenant2');
        console.log('Tenant isolation:', { tenant1Data, tenant2Data });

        // Test 5: Cache warm-up
        console.log('\n5. Testing cache warm-up...');
        const warmUpKeys = [
            {
                key: 'warmup:1',
                fetchFn: async () => ({ id: 1, data: 'Warm data 1' })
            },
            {
                key: 'warmup:2',
                fetchFn: async () => ({ id: 2, data: 'Warm data 2' })
            }
        ];

        await cache.warmUpCache(warmUpKeys);
        const warmData = await Promise.all(
            warmUpKeys.map(({ key }) => cache.get(key))
        );
        console.log('Warm-up data:', warmData);

        console.log('\nCache service tests completed successfully!');

    } catch (error) {
        console.error('Cache service test failed:', error);
        throw error;
    }
}

// Run the test
testCacheService().catch(console.error); 