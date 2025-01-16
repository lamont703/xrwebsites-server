import { CosmosClient, Container, FeedOptions, SqlQuerySpec } from '@azure/cosmos';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { Logger } from './logger.service';

export class SearchService {
    private static instance: SearchService;
    private readonly searchClient: SearchClient;
    private readonly logger: Logger;

    private constructor(
        private readonly client: CosmosClient,
        searchEndpoint: string,
        searchKey: string,
        logger: Logger
    ) {
        this.searchClient = new SearchClient(
            searchEndpoint,
            'xrwebsites-index',
            new AzureKeyCredential(searchKey)
        );
        this.logger = logger;
    }

    static async initialize(
        client: CosmosClient,
        logger: Logger
    ): Promise<SearchService> {
        if (!SearchService.instance) {
            const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT!;
            const searchKey = process.env.AZURE_SEARCH_KEY!;

            SearchService.instance = new SearchService(
                client,
                searchEndpoint,
                searchKey,
                logger
            );
        }
        return SearchService.instance;
    }

    async search<T>(
        collection: string,
        criteria: {
            searchText?: string;
            filters?: Record<string, any>;
            partitionKey?: string;
        },
        options: {
            pageSize?: number;
            continuationToken?: string;
        } = {}
    ): Promise<{
        results: T[];
        continuationToken?: string;
        hasMoreResults: boolean;
    }> {
        try {
            const container = this.client.database('xrwebsites-db-2024').container(collection);
            const { searchText, filters, partitionKey } = criteria;
            const { pageSize = 50 } = options;

            // Build query parts
            const conditions: string[] = [];
            const parameters: any[] = [];

            // Add text search if provided
            if (searchText) {
                conditions.push(`CONTAINS(c.searchableText, @searchText)`);
                parameters.push({ name: '@searchText', value: searchText });
            }

            // Add filters
            if (filters) {
                Object.entries(filters).forEach(([key, value], index) => {
                    if (Array.isArray(value)) {
                        conditions.push(`c.${key} IN (@p${index})`);
                        parameters.push({ name: `@p${index}`, value });
                    } else {
                        conditions.push(`c.${key} = @p${index}`);
                        parameters.push({ name: `@p${index}`, value });
                    }
                });
            }

            // Build final query
            const querySpec: SqlQuerySpec = {
                query: `
                    SELECT * FROM c
                    ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
                `,
                parameters
            };

            // Set feed options
            const feedOptions: FeedOptions = {
                maxItemCount: pageSize,
                continuationToken: options.continuationToken,
                partitionKey
            };

            // Execute query
            const response = await container.items
                .query<T>(querySpec, feedOptions)
                .fetchNext();

            return {
                results: response.resources,
                continuationToken: response.continuationToken,
                hasMoreResults: response.hasMoreResults
            };
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'SearchService',
                operation: 'search',
                collection,
                criteria
            });
            throw error;
        }
    }

    // Specialized search for specific document types
    async searchByType<T>(
        collection: string,
        documentType: string,
        criteria: {
            searchText?: string;
            filters?: Record<string, any>;
        },
        options: {
            pageSize?: number;
            continuationToken?: string;
        } = {}
    ) {
        return this.search<T>(
            collection,
            {
                ...criteria,
                filters: {
                    ...criteria.filters,
                    type: documentType
                }
            },
            options
        );
    }

    // Search for users
    async searchUsers(
        tenantId: string,
        criteria: {
            searchText?: string;
            role?: string;
            status?: 'active' | 'inactive';
        },
        options?: {
            pageSize?: number;
            continuationToken?: string;
        }
    ) {
        return this.search<User>(
            'users',
            {
                ...criteria,
                partitionKey: tenantId,
                filters: {
                    ...(criteria.role && { role: criteria.role }),
                    ...(criteria.status && { status: criteria.status })
                }
            },
            options
        );
    }

    // Search for transactions
    async searchTransactions(
        tenantId: string,
        criteria: {
            searchText?: string;
            type?: 'transfer' | 'deposit' | 'withdrawal';
            status?: 'pending' | 'completed' | 'failed';
            userId?: string;
            minAmount?: number;
            maxAmount?: number;
            dateRange?: { start: string; end: string };
        },
        options?: {
            pageSize?: number;
            continuationToken?: string;
        }
    ) {
        const conditions: string[] = [];
        const parameters: any[] = [];

        if (criteria.minAmount) {
            conditions.push('c.amount >= @minAmount');
            parameters.push({ name: '@minAmount', value: criteria.minAmount });
        }

        if (criteria.maxAmount) {
            conditions.push('c.amount <= @maxAmount');
            parameters.push({ name: '@maxAmount', value: criteria.maxAmount });
        }

        if (criteria.dateRange) {
            conditions.push('c.timestamp BETWEEN @startDate AND @endDate');
            parameters.push(
                { name: '@startDate', value: criteria.dateRange.start },
                { name: '@endDate', value: criteria.dateRange.end }
            );
        }

        if (criteria.userId) {
            conditions.push('(c.from.userId = @userId OR c.to.userId = @userId)');
            parameters.push({ name: '@userId', value: criteria.userId });
        }

        return this.search<Transaction>(
            'transactions',
            {
                searchText: criteria.searchText,
                partitionKey: tenantId,
                filters: {
                    ...(criteria.type && { type: criteria.type }),
                    ...(criteria.status && { status: criteria.status }),
                    _conditions: conditions,
                    _parameters: parameters
                }
            },
            options
        );
    }

    // Search for wallets
    async searchWallets(
        tenantId: string,
        criteria: {
            searchText?: string;
            status?: 'active' | 'frozen' | 'closed';
            minBalance?: number;
            maxBalance?: number;
        },
        options?: {
            pageSize?: number;
            continuationToken?: string;
        }
    ) {
        const conditions: string[] = [];
        const parameters: any[] = [];

        if (criteria.minBalance) {
            conditions.push('c.balance >= @minBalance');
            parameters.push({ name: '@minBalance', value: criteria.minBalance });
        }

        if (criteria.maxBalance) {
            conditions.push('c.balance <= @maxBalance');
            parameters.push({ name: '@maxBalance', value: criteria.maxBalance });
        }

        return this.search<Wallet>(
            'wallets',
            {
                searchText: criteria.searchText,
                partitionKey: tenantId,
                filters: {
                    ...(criteria.status && { status: criteria.status }),
                    _conditions: conditions,
                    _parameters: parameters
                }
            },
            options
        );
    }
} 