import { CosmosClient } from '@azure/cosmos';
import { RateLimiter } from '../services/rateLimiter.service';
import { Logger } from '../services/logger.service';
import dotenv from 'dotenv';

dotenv.config();

async function testRateLimiter() {
    try {
        console.log('Starting rate limiter tests...');

        // Initialize dependencies
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const logger = await Logger.initialize(client);

        // Use Azure Redis configuration
        const rateLimiter = await RateLimiter.initialize(
            client,
            logger,
            {
                host: process.env.AZURE_REDIS_HOST!,
                key: process.env.AZURE_REDIS_KEY!,
                port: parseInt(process.env.AZURE_REDIS_PORT!) || 6380
            }
        );

        console.log('Rate limiter initialized with Azure Redis');

        // Test 1: Basic rate limiting
        console.log('\n1. Testing basic rate limiting...');
        const testTenantId = 'test_tenant';
        const testUserId = 'test_user';
        
        const mockReq = {
            headers: { 'x-tenant-id': testTenantId },
            user: { id: testUserId },
            ip: '127.0.0.1'
        };

        const mockRes = {
            status: (code: number) => ({
                json: (data: any) => console.log(`Response ${code}:`, data)
            }),
            setHeader: (name: string, value: any) => 
                console.log(`Header ${name}:`, value)
        };

        const middleware = rateLimiter.middleware();

        // Simulate multiple requests
        console.log('\nSimulating rapid requests...');
        for (let i = 0; i < 12; i++) {
            await new Promise<void>((resolve) => {
                middleware(
                    mockReq as any,
                    mockRes as any,
                    () => {
                        console.log(`Request ${i + 1} processed`);
                        resolve();
                    }
                );
            });
        }

        // Test 2: Different time windows
        console.log('\n2. Testing different time windows...');
        const windows = ['second', 'minute', 'hour', 'day'];
        for (const window of windows) {
            const key = `ratelimit:${testTenantId}:api:tenant:${window}`;
            const count = await (rateLimiter as any).redis.get(key);
            console.log(`${window} window count:`, count);
        }

        // Test 3: Tenant isolation
        console.log('\n3. Testing tenant isolation...');
        const anotherTenantReq = {
            headers: { 'x-tenant-id': 'another_tenant' },
            user: { id: testUserId },
            ip: '127.0.0.1'
        };

        await new Promise<void>((resolve) => {
            middleware(
                anotherTenantReq as any,
                mockRes as any,
                () => {
                    console.log('Request from another tenant processed');
                    resolve();
                }
            );
        });

        console.log('\nRate limiter tests completed successfully!');

    } catch (error) {
        console.error('Rate limiter test failed:', error);
        throw error;
    }
}

// Run the test
testRateLimiter().catch(console.error); 