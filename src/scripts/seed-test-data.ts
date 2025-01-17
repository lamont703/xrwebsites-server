import { CosmosClient } from '@azure/cosmos';
import dotenv from 'dotenv';

dotenv.config();

async function seedTestData() {
    try {
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const database = client.database('xrwebsites-db-2024');

        // Create old test documents
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 100); // 100 days old

        const testData = {
            jobs: [
                {
                    id: `job-${Date.now()}-1`,
                    tenantId: 'test-tenant',
                    type: 'modeling',
                    status: 'completed',
                    createdAt: oldDate.toISOString(),
                    title: 'Old Test Job 1'
                },
                {
                    id: `job-${Date.now()}-2`,
                    tenantId: 'test-tenant',
                    type: 'animation',
                    status: 'completed',
                    createdAt: new Date().toISOString(), // Current date
                    title: 'Current Test Job'
                }
            ],
            transactions: [
                {
                    id: `tx-${Date.now()}-1`,
                    tenantId: 'test-tenant',
                    type: 'payment',
                    status: 'completed',
                    createdAt: oldDate.toISOString(),
                    amount: 100
                }
            ],
            logs: [
                {
                    id: `log-${Date.now()}-1`,
                    tenantId: 'test-tenant',
                    type: 'system',
                    createdAt: oldDate.toISOString(),
                    message: 'Old test log'
                }
            ]
        };

        // Insert test data
        for (const [containerName, documents] of Object.entries(testData)) {
            const container = database.container(containerName);
            console.log(`Seeding ${containerName}...`);
            
            for (const doc of documents) {
                await container.items.create(doc);
                console.log(`Created ${containerName} document:`, doc.id);
            }
        }

        console.log('✓ Test data seeded successfully');
    } catch (error) {
        console.error('Failed to seed test data:', error);
        process.exit(1);
    }
}

seedTestData().catch(console.error); 