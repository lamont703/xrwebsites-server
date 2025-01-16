import { 
    SearchClient, 
    SearchIndexClient, 
    AzureKeyCredential,
    SearchIndex
} from "@azure/search-documents";
import { Logger } from './logger.service';

interface SearchableDocument {
    id: string;
    tenantId: string;
    type: string;
    content: string;
    [key: string]: any;
}

export class CognitiveSearchService {
    private static instance: CognitiveSearchService;
    private searchClient: SearchClient<SearchableDocument>;
    private indexClient: SearchIndexClient;
    private readonly logger: Logger;

    private constructor(
        endpoint: string,
        apiKey: string,
        private readonly indexName: string,
        logger: Logger
    ) {
        const credential = new AzureKeyCredential(apiKey);
        this.searchClient = new SearchClient<SearchableDocument>(
            endpoint,
            indexName,
            credential
        );
        this.indexClient = new SearchIndexClient(endpoint, credential);
        this.logger = logger;
    }

    static async initialize(logger: Logger): Promise<CognitiveSearchService> {
        if (!CognitiveSearchService.instance) {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT!;
            const apiKey = process.env.AZURE_SEARCH_API_KEY!;
            const indexName = process.env.AZURE_SEARCH_INDEX_NAME!;

            CognitiveSearchService.instance = new CognitiveSearchService(
                endpoint,
                apiKey,
                indexName,
                logger
            );

            await CognitiveSearchService.instance.initializeIndex();
        }
        return CognitiveSearchService.instance;
    }

    private async initializeIndex(): Promise<void> {
        try {
            const index: SearchIndex = {
                name: this.indexName,
                fields: [
                    {
                        name: "id",
                        type: "Edm.String",
                        key: true,
                        searchable: false
                    },
                    {
                        name: "tenantId",
                        type: "Edm.String",
                        filterable: true,
                        searchable: false
                    },
                    {
                        name: "type",
                        type: "Edm.String",
                        filterable: true,
                        facetable: true
                    },
                    {
                        name: "content",
                        type: "Edm.String",
                        searchable: true,
                        analyzer: "standard.lucene"
                    },
                    {
                        name: "tags",
                        type: "Collection(Edm.String)",
                        searchable: true,
                        filterable: true,
                        facetable: true
                    },
                    {
                        name: "createdAt",
                        type: "Edm.DateTimeOffset",
                        filterable: true,
                        sortable: true
                    }
                ]
            };

            await this.indexClient.createOrUpdateIndex(index);
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CognitiveSearchService',
                operation: 'initializeIndex'
            });
            throw error;
        }
    }

    async indexDocument(document: SearchableDocument): Promise<void> {
        try {
            await this.searchClient.uploadDocuments([document]);
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CognitiveSearchService',
                operation: 'indexDocument',
                documentId: document.id
            });
            throw error;
        }
    }

    async search(
        tenantId: string,
        query: string,
        options: {
            type?: string;
            tags?: string[];
            dateRange?: { start: Date; end: Date };
            skip?: number;
            top?: number;
            orderBy?: string;
        } = {}
    ) {
        try {
            const searchOptions = {
                filter: this.buildFilter(tenantId, options),
                facets: ["type", "tags"],
                skip: options.skip || 0,
                top: options.top || 50,
                orderBy: options.orderBy,
                highlightFields: ["content"],
                includeTotalCount: true
            };

            const searchResults = await this.searchClient.search(query, searchOptions);
            const results = [];
            let totalCount = 0;

            for await (const result of searchResults.results) {
                results.push({
                    document: result.document,
                    score: result.score,
                    highlights: result.highlights
                });
            }

            totalCount = searchResults.count || 0;

            return {
                results,
                totalCount,
                facets: searchResults.facets
            };

        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CognitiveSearchService',
                operation: 'search',
                query
            });
            throw error;
        }
    }

    private buildFilter(tenantId: string, options: any): string {
        const filters = [`tenantId eq '${tenantId}'`];

        if (options.type) {
            filters.push(`type eq '${options.type}'`);
        }

        if (options.tags?.length) {
            const tagFilters = options.tags
                .map((tag: string) => `tags/any(t: t eq '${tag}')`)
                .join(' and ');
            filters.push(`(${tagFilters})`);
        }

        if (options.dateRange) {
            filters.push(
                `createdAt ge ${options.dateRange.start.toISOString()} and ` +
                `createdAt le ${options.dateRange.end.toISOString()}`
            );
        }

        return filters.join(' and ');
    }

    async deleteDocument(id: string): Promise<void> {
        try {
            await this.searchClient.deleteDocuments([{ id }]);
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CognitiveSearchService',
                operation: 'deleteDocument',
                documentId: id
            });
            throw error;
        }
    }
} 