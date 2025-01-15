require('dotenv').config({ path: '../../.env' });
const { CosmosClient } = require('@azure/cosmos');

async function testCosmosConnection() {
    try {
        // Log environment variables to verify they're loaded
        console.log('Testing with endpoint:', 'https://xrwebsites-db-2024.documents.azure.com:443/');
        
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY
        });

        // Test database connection
        const { database } = await client.database(process.env.COSMOS_DB_DATABASE);
        console.log('✅ Database connection successful:', database.id);

        // Test container access
        const { container } = await database.container(process.env.COSMOS_DB_CONTAINER);
        console.log('✅ Container access successful:', container.id);

        // Test query
        const querySpec = {
            query: "SELECT VALUE COUNT(1) FROM c"
        };
        const { resources: count } = await container.items.query(querySpec).fetchAll();
        console.log('✅ Query successful. Document count:', count[0]);

    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        console.error('Error details:', error);
    }
}

// Run the test
testCosmosConnection(); 