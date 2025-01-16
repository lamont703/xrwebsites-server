// Initialize the service
const searchService = await CognitiveSearchService.initialize(logger);

// Index a document
await searchService.indexDocument({
    id: 'doc1',
    tenantId: 'tenant1',
    type: 'transaction',
    content: 'Payment processed for order #12345',
    tags: ['payment', 'processed'],
    createdAt: new Date()
});

// Search documents
const results = await searchService.search('tenant1', 'payment', {
    type: 'transaction',
    tags: ['processed'],
    dateRange: {
        start: new Date('2024-01-01'),
        end: new Date()
    }
});

console.log(`Found ${results.totalCount} documents`);
console.log('Facets:', results.facets);
console.log('Results:', results.results); 