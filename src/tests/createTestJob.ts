import { CosmosClient } from '@azure/cosmos';
import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

async function createTestJob() {
    try {
        console.log('Starting complete notification test...');
        
        // 1. Connect to WebSocket first
        const ws = new WebSocket('ws://localhost:8080/ws');
        
        await new Promise<void>((resolve) => {
            ws.on('open', () => {
                console.log('WebSocket connected');
                // Subscribe as test user
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    userId: 'test_user_123'
                }));
                resolve();
            });
        });

        // 2. Listen for notifications
        ws.on('message', (data) => {
            console.log('Received notification:', data.toString());
        });

        // 3. Create the test job
        console.log('Creating test job...');
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const database = client.database('XRWebsites');
        const container = database.container('jobs');

        const testJob = {
            id: `job_${Date.now()}`,
            type: "job",
            creatorId: 'test_user_123',
            title: 'Test Job ' + new Date().toISOString(),
            description: 'This is a test job to verify real-time notifications',
            status: 'active',
            budget: {
                amount: 1000,
                currency: 'USD',
                type: 'fixed'
            },
            skills: ['test', 'development'],
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        console.log('Job data:', testJob);
        const { resource } = await container.items.create(testJob);
        console.log('Created test job successfully:', resource);

        // 4. Wait for notification (up to 10 seconds)
        await new Promise((resolve) => setTimeout(resolve, 10000));
        
        // 5. Clean up
        ws.close();
        console.log('Test complete');
        process.exit(0);

    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

createTestJob().catch(console.error); 