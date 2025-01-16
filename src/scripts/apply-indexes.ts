import { CosmosClient } from '@azure/cosmos';
import { Logger } from '../services/logger.service';
import { IndexingService } from '../services/indexing.service';
import dotenv from 'dotenv';

dotenv.config();

async function applyIndexes() {
    try {
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const logger = await Logger.initialize(client);
        const indexingService = await IndexingService.initialize(client, logger);

        // Apply to all collections
        await indexingService.applyIndexingPolicies();

        // Or apply to specific collections
        // await indexingService.applyIndexingPolicies(['users', 'transactions']);

    } catch (error) {
        console.error('Error applying indexes:', error);
        process.exit(1);
    }
}

applyIndexes().catch(console.error); 