import { describe, test, expect, beforeAll } from 'vitest';
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { config } from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
config({ path: path.resolve(__dirname, '../../../.env') });

describe('Azure Search Service Tests', () => {
    let searchClient: SearchClient;

    beforeAll(async () => {
        // Get the endpoint
        const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT?.startsWith('https://')
            ? process.env.AZURE_SEARCH_ENDPOINT
            : `https://${process.env.AZURE_SEARCH_ENDPOINT}`;

        console.log('Azure Search Configuration:', {
            searchEndpoint,
            searchIndexName: 'xrwebsites-index',
            searchKeyLength: process.env.AZURE_SEARCH_API_KEY?.length
        });

        // Initialize Azure Search client
        searchClient = new SearchClient(
            searchEndpoint,
            'xrwebsites-index',
            new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY!)
        );
    });

    describe('Search Operations', () => {
        test('should perform basic search', async () => {
            try {
                console.log('\n1. Performing search...');
                const searchResults = await searchClient.search('*');

                console.log('\n2. Search Results:');
                const results = [];
                for await (const result of searchResults.results) {
                    results.push(result);
                    console.log('Document:', result.document);
                }

                expect(searchResults).toBeDefined();

            } catch (error) {
                console.error('\n❌ Test Error:', {
                    name: error.name,
                    message: error.message,
                    details: error.details || error.stack,
                    endpoint: process.env.AZURE_SEARCH_ENDPOINT
                });
                throw error;
            }
        });
    });
}); 