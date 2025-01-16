import { config } from 'dotenv';
import { beforeAll } from 'vitest';
import { CosmosClient } from '@azure/cosmos';
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import path from 'path';

config({ path: path.resolve(__dirname, '../../.env') });

async function testConnection() {
    // Test Azure Search connection
    const searchClient = new SearchClient(
        process.env.AZURE_SEARCH_ENDPOINT!,
        'xrwebsites-index',
        new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY!)
    );

    try {
        // Test search connection
        await searchClient.search('*');
        console.log('✅ Azure Search connection successful');
        return true;
    } catch (error) {
        console.error('❌ Azure Search connection failed:', error);
        return false;
    }
}

export const testConfig = {
    searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT!,
    searchKey: process.env.AZURE_SEARCH_API_KEY!,
    searchIndexName: 'xrwebsites-index'
};

beforeAll(async () => {
    const isConnected = await testConnection();
    if (!isConnected) {
        throw new Error('Failed to connect to Azure Search');
    }
}); 