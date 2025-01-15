import { CosmosClient } from '@azure/cosmos';
import { Logger, LogEvent } from '../services/logger.service';
import dotenv from 'dotenv';

dotenv.config();

async function testLogging() {
    try {
        console.log('Starting logging system tests...');

        // Initialize Cosmos client
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        // Initialize logger
        const logger = await Logger.initialize(client);
        console.log('✓ Logger initialized');

        // Test 1: Log user login
        const loginEvent: LogEvent = {
            tenantId: 'test_tenant',
            eventType: 'user.login',
            severity: 'info',
            actor: {
                id: 'test_user_123',
                type: 'user',
                ip: '127.0.0.1',
                userAgent: 'Mozilla/5.0'
            },
            status: 'success',
            metadata: {
                location: 'US',
                device: 'desktop'
            }
        };

        await logger.log(loginEvent);
        console.log('✓ Logged user login event');

        // Test 2: Log system error
        await logger.logError('test_tenant', new Error('Test error'), {
            component: 'payment_processor',
            operation: 'validate_transaction'
        });
        console.log('✓ Logged system error');

        // Test 3: Log data change
        const changeEvent: LogEvent = {
            tenantId: 'test_tenant',
            eventType: 'job.updated',
            severity: 'info',
            actor: {
                id: 'test_user_123',
                type: 'user'
            },
            target: {
                id: 'job_123',
                type: 'job',
                name: 'Test Job'
            },
            changes: {
                before: { status: 'draft' },
                after: { status: 'published' }
            },
            status: 'success'
        };

        await logger.log(changeEvent);
        console.log('✓ Logged data change event');

        // Verify logs
        const database = client.database('XRWebsites');
        const container = database.container('logs');
        
        const querySpec = {
            query: "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c.timestamp DESC",
            parameters: [
                {
                    name: "@tenantId",
                    value: "test_tenant"
                }
            ]
        };

        const { resources: logs } = await container.items.query(querySpec).fetchAll();
        console.log(`\nFound ${logs.length} logs:`);
        logs.forEach(log => {
            console.log(`- ${log.timestamp}: ${log.eventType} (${log.severity})`);
        });

        console.log('\nLogging system tests completed successfully!');

    } catch (error) {
        console.error('Logging system test failed:', error);
        throw error;
    }
}

// Run the test
testLogging().catch(console.error); 