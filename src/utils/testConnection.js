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

        // Second database connection (renamed to xrDatabase)
        const { database: xrDatabase } = await client.database('XRWebsites');
        console.log('✅ Database connection successful:', xrDatabase.id);

        const containers = await xrDatabase.containers.readAll().fetchAll();
        console.log('Available containers:', containers.resources.map(c => c.id));

        // Creating wallets for 3 test users
        const [wallet1, wallet2, wallet3] = await Promise.all([
            transactionService.createWallet(tenantId, user1),
            transactionService.createWallet(tenantId, user2),
            transactionService.createWallet(tenantId, user3)
        ]);

        // Test deposits
        const deposits = await Promise.all([
            transactionService.deposit(tenantId, user1, 1000, 'test_deposit'),
            transactionService.deposit(tenantId, user2, 500, 'test_deposit')
        ]);

        // Testing transfers between users
        const transfers = await Promise.all([
            transactionService.transfer(tenantId, user1, user2, 100),
            transactionService.transfer(tenantId, user2, user3, 50)
        ]);

        const finalBalances = await Promise.all([
            transactionService.getWallet(tenantId, user1),
            transactionService.getWallet(tenantId, user2),
            transactionService.getWallet(tenantId, user3)
        ]);

        const user1History = await transactionService.getTransactionHistory(tenantId, user1);
        const user2History = await transactionService.getTransactionHistory(tenantId, user2);

    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        console.error('Error details:', error);
    }
}

// Run the test
testCosmosConnection(); 