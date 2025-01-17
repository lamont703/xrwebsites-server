import { CosmosClient } from '@azure/cosmos';
import { BlobServiceClient } from '@azure/storage-blob';
import dotenv from 'dotenv';

dotenv.config();

async function verifyArchive() {
    try {
        // Check Cosmos DB
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const database = client.database('xrwebsites-db-2024');

        // Check remaining documents
        for (const container of ['jobs', 'transactions', 'logs']) {
            const { resources: docs } = await database.container(container)
                .items.query({
                    query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
                    parameters: [{ name: "@tenantId", value: "test-tenant" }]
                })
                .fetchAll();
            
            console.log(`\nRemaining ${container}:`, docs.length);
            docs.forEach(doc => console.log(`- ${doc.id} (created: ${doc.createdAt})`));
        }

        // Check Blob Storage
        const blobClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING!
        );
        const containerClient = blobClient.getContainerClient('archives');

        console.log('\nArchived documents:');
        for await (const blob of containerClient.listBlobsFlat()) {
            console.log(`- ${blob.name}`);
        }

    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verifyArchive().catch(console.error); 