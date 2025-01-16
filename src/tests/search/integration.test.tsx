import { describe, test, expect, beforeAll } from 'vitest';
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { testConfig } from '../test.env';

describe('Azure Search Integration Tests', () => {
    let searchClient: SearchClient;

    beforeAll(async () => {
        // Debug connection settings
        console.log('Search Configuration:', {
            endpoint: testConfig.searchEndpoint,
            indexName: testConfig.searchIndexName,
            keyLength: testConfig.searchKey.length
        });

        searchClient = new SearchClient(
            testConfig.searchEndpoint,
            testConfig.searchIndexName,
            new AzureKeyCredential(testConfig.searchKey)
        );
    });

    describe('Search Operations', () => {
        test('should perform basic search with id field', async () => {
            try {
                // Test document with only id field
                const testDoc = {
                    id: `test-doc-${Date.now()}`
                };

                console.log('\n1. Test Document:', JSON.stringify(testDoc, null, 2));

                // Upload test document
                console.log('\n2. Uploading document...');
                const uploadResponse = await searchClient.uploadDocuments([testDoc]);
                console.log('Upload Response:', JSON.stringify(uploadResponse, null, 2));

                // Wait for indexing
                console.log('\n3. Waiting for indexing...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Test search by id
                console.log('\n4. Performing search...');
                const searchOptions = {
                    select: ['id'],
                    includeTotalCount: true
                };
                
                const searchResults = await searchClient.search(testDoc.id, searchOptions);
                console.log('Search Options:', JSON.stringify(searchOptions, null, 2));
                
                // Debug search results
                console.log('\n5. Processing search results...');
                const results = [];
                for await (const result of searchResults.results) {
                    results.push(result);
                    console.log('Found Document:', {
                        score: result.score,
                        document: result.document
                    });
                }
                
                console.log('\nTotal Results:', results.length);
                console.log('Total Count:', searchResults.count);

                // Assertions
                expect(results.length, 'No search results found').toBeGreaterThan(0);
                expect(results[0].document.id, 'Document ID mismatch').toBe(testDoc.id);

                // Clean up
                console.log('\n6. Cleaning up...');
                const deleteResponse = await searchClient.deleteDocuments([{ id: testDoc.id }]);
                console.log('Delete Response:', JSON.stringify(deleteResponse, null, 2));

            } catch (error) {
                console.error('\n❌ Test Error:', {
                    name: error.name,
                    message: error.message,
                    details: error.details || error.stack
                });
                throw error;
            }
        });
    });
}); 