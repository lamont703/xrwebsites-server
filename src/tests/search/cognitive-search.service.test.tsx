import { describe, test, expect, beforeAll } from 'vitest';
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { config } from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
config({ path: path.resolve(__dirname, '../../../.env') });

describe('Azure Search Tests', () => {
    let searchClient: SearchClient;

    beforeAll(async () => {
        // Get the endpoint
        const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT?.startsWith('https://')
            ? process.env.AZURE_SEARCH_ENDPOINT
            : `https://${process.env.AZURE_SEARCH_ENDPOINT}`;

        // Initialize Azure Search client with properly formatted URL
        searchClient = new SearchClient(
            searchEndpoint,
            'xrwebsites-index',  // Hardcode index name for now
            new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY!)
        );
    });

    describe('Search Operations', () => {
        test('should perform basic search', async () => {
            try {
                const searchResults = await searchClient.search('*');
                const results = [];
                
                for await (const result of searchResults.results) {
                    results.push(result);
                }

                expect(searchResults).toBeDefined();

            } catch (error) {
                throw error;
            }
        });
    });
}); 