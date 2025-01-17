import { CosmosClient } from '@azure/cosmos';
import { Logger } from '../services/logger.service';
import { StorageService } from '../services/storage.service';
import { CleanupService } from '../services/cleanup.service';
import dotenv from 'dotenv';

dotenv.config();

async function ensureDatabase(client: CosmosClient) {
    console.log('Ensuring database exists...');
    const { database } = await client.databases.createIfNotExists({
        id: 'xrwebsites-db-2024'
    });
    return database;
}

async function ensureContainer(database: any, containerId: string) {
    console.log(`Ensuring container ${containerId} exists...`);
    const { container } = await database.containers.createIfNotExists({
        id: containerId,
        partitionKey: {
            paths: ['/tenantId']
        }
    });
    return container;
}

async function runCleanup() {
    try {
        console.log('Starting cleanup with configuration:', {
            endpoint: process.env.COSMOS_DB_ENDPOINT?.split('.')[0], // Only show first part for security
            database: 'xrwebsites-db-2024'
        });

        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        // Ensure database exists
        const database = await ensureDatabase(client);
        console.log('✓ Database verified:', database.id);

        // Ensure required containers exist
        const containers = ['jobs', 'transactions', 'logs'];
        for (const containerId of containers) {
            const container = await ensureContainer(database, containerId);
            console.log('✓ Container verified:', container.id);
        }

        const logger = await Logger.initialize(client);
        const storageService = await StorageService.initialize(logger);
        const cleanupService = await CleanupService.initialize(client, storageService, logger);

        // Archive data based on retention policies
        console.log('\nStarting archival process...');
        await cleanupService.archiveOldData('jobs', 90);
        await cleanupService.archiveOldData('transactions', 90);
        await cleanupService.archiveOldData('logs', 30);

        console.log('\n✓ Cleanup completed successfully');
    } catch (error: any) {
        console.error('Cleanup failed:', {
            name: error.name,
            message: error.message,
            code: error.code,
            details: error.stack
        });
        process.exit(1);
    }
}

runCleanup().catch(console.error); 