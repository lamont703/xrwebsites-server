import { CosmosClient } from '@azure/cosmos';
import { Logger } from '../services/logger.service';
import { CognitiveSearchService } from '../services/cognitive-search.service';
import { SyncService } from '../services/sync.service';
import dotenv from 'dotenv';

dotenv.config();

async function syncSearchIndex() {
    try {
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const logger = await Logger.initialize(client);
        const searchService = await CognitiveSearchService.initialize(logger);
        const syncService = await SyncService.initialize(client, searchService, logger);

        // Initial sync
        console.log('Starting initial sync...');
        await Promise.all([
            syncService.syncCollection('users'),
            syncService.syncCollection('transactions'),
            syncService.syncCollection('wallets')
        ]);

        // Start real-time sync
        console.log('Starting real-time sync...');
        await Promise.all([
            syncService.startChangeFeedProcessor('users'),
            syncService.startChangeFeedProcessor('transactions'),
            syncService.startChangeFeedProcessor('wallets')
        ]);

        console.log('Sync service running...');
    } catch (error) {
        console.error('Error in sync process:', error);
        process.exit(1);
    }
}

syncSearchIndex().catch(console.error); 