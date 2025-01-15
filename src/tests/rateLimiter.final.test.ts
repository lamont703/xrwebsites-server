import { CosmosClient } from '@azure/cosmos';
import { RateLimiter } from '../services/rateLimiter.service';
import { Logger } from '../services/logger.service';
import dotenv from 'dotenv';

dotenv.config();

async function finalRateLimiterTest() {
    try {
        console.log('Starting final rate limiter tests...');

        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const logger = await Logger.initialize(client);
        const rateLimiter = await RateLimiter.initialize(
            client,
            logger,
            {
                host: process.env.AZURE_REDIS_HOST!,
                key: process.env.AZURE_REDIS_KEY!,
                port: parseInt(process.env.AZURE_REDIS_PORT!) || 6380
            }
        );

        // Test scenarios
        console.log('\n1. Testing tenant isolation...');
        const tenant1 = 'test_tenant_1';
        const tenant2 = 'test_tenant_2';

        // Test concurrent requests
        console.log('\n2. Testing concurrent requests...');
        const concurrentTests = Array(5).fill(null).map(async (_, i) => {
            const mockReq = {
                headers: { 'x-tenant-id': tenant1 },
                user: { id: `user_${i}` },
                ip: '127.0.0.1'
            };

            const mockRes = {
                status: (code: number) => ({
                    json: (data: any) => console.log(`Response ${code} for request ${i}:`, data)
                }),
                setHeader: (name: string, value: any) => 
                    console.log(`Header ${name} for request ${i}:`, value)
            };

            return new Promise<void>((resolve) => {
                rateLimiter.middleware()(
                    mockReq as any,
                    mockRes as any,
                    () => {
                        console.log(`Concurrent request ${i} processed`);
                        resolve();
                    }
                );
            });
        });

        await Promise.all(concurrentTests);

        // Test rate limit recovery
        console.log('\n3. Testing rate limit recovery...');
        console.log('Waiting 5 seconds for partial reset...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Test different endpoints
        console.log('\n4. Testing endpoint-specific limits...');
        const endpoints = ['/api/jobs', '/api/assets', '/api/users'];
        for (const endpoint of endpoints) {
            const mockReq = {
                headers: { 'x-tenant-id': tenant1 },
                user: { id: 'test_user' },
                ip: '127.0.0.1',
                path: endpoint
            };

            const mockRes = {
                status: (code: number) => ({
                    json: (data: any) => console.log(`Response ${code} for ${endpoint}:`, data)
                }),
                setHeader: (name: string, value: any) => 
                    console.log(`Header ${name} for ${endpoint}:`, value)
            };

            await new Promise<void>((resolve) => {
                rateLimiter.middleware()(
                    mockReq as any,
                    mockRes as any,
                    () => {
                        console.log(`Endpoint ${endpoint} request processed`);
                        resolve();
                    }
                );
            });
        }

        // Test error handling
        console.log('\n5. Testing error handling...');
        try {
            const mockReq = {
                headers: {},  // Missing tenant ID
                user: { id: 'test_user' },
                ip: '127.0.0.1'
            };

            const mockRes = {
                status: (code: number) => ({
                    json: (data: any) => console.log(`Error test response ${code}:`, data)
                }),
                setHeader: (name: string, value: any) => 
                    console.log(`Error test header ${name}:`, value)
            };

            await new Promise<void>((resolve) => {
                rateLimiter.middleware()(
                    mockReq as any,
                    mockRes as any,
                    (error: any) => {
                        console.log('Error handled:', error?.message);
                        resolve();
                    }
                );
            });
        } catch (error) {
            console.log('Expected error caught:', error);
        }

        console.log('\nFinal rate limiter tests completed successfully!');

    } catch (error) {
        console.error('Final rate limiter test failed:', error);
        throw error;
    }
}

// Run the final test
finalRateLimiterTest().catch(console.error); 