import { describe, test, expect, beforeAll } from 'vitest';
import { SearchClient, SearchIndexClient, AzureKeyCredential } from "@azure/search-documents";
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

describe('Azure Search Indexing Tests', () => {
    let searchClient: SearchClient;
    let indexClient: SearchIndexClient;

    beforeAll(async () => {
        const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT?.startsWith('https://')
            ? process.env.AZURE_SEARCH_ENDPOINT
            : `https://${process.env.AZURE_SEARCH_ENDPOINT}`;

        searchClient = new SearchClient(
            searchEndpoint,
            'xrwebsites-index',
            new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY!)
        );

        indexClient = new SearchIndexClient(
            searchEndpoint,
            new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY!)
        );
    });

    describe('Index Operations', () => {
        test('should get index status', async () => {
            try {
                const indexStats = await indexClient.getIndexStatistics('xrwebsites-index');
                expect(indexStats).toBeDefined();
                expect(indexStats.documentCount).toBeDefined();
            } catch (error) {
                throw error;
            }
        });

        test('should list index fields', async () => {
            try {
                const index = await indexClient.getIndex('xrwebsites-index');
                expect(index.fields).toBeDefined();
                expect(index.fields.length).toBeGreaterThan(0);
            } catch (error) {
                throw error;
            }
        });
    });
}); 