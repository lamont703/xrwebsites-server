import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

async function testRedisConnection() {
    try {
        console.log('Testing Redis connection...');

        const redis = new Redis({
            host: process.env.AZURE_REDIS_HOST,
            port: parseInt(process.env.AZURE_REDIS_PORT!) || 6380,
            password: process.env.AZURE_REDIS_KEY,
            tls: { 
                servername: process.env.AZURE_REDIS_HOST 
            }
        });

        redis.on('connect', () => {
            console.log('Successfully connected to Azure Redis Cache');
        });

        redis.on('error', (err) => {
            console.error('Redis connection error:', err);
        });

        // Test basic operations
        await redis.set('test_key', 'Hello Redis!');
        const value = await redis.get('test_key');
        console.log('Test value:', value);

        // Clean up
        await redis.del('test_key');
        await redis.quit();

        console.log('Redis connection test completed successfully!');

    } catch (error) {
        console.error('Redis test failed:', error);
        throw error;
    }
}

// Run the test
testRedisConnection().catch(console.error); 