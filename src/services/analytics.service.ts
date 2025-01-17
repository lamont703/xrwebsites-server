import { CosmosClient, Container } from '@azure/cosmos';
import { Logger } from './logger.service';
import { CacheService } from './cache.service';

interface AnalyticsQuery {
    timeframe: 'daily' | 'weekly' | 'monthly';
    tenantId: string;
    startDate?: Date;
    endDate?: Date;
}

export class AnalyticsService {
    private client: CosmosClient;
    private analyticsContainer: Container;
    private logger: Logger;
    private cache: CacheService;

    static async initialize(
        client: CosmosClient,
        logger: Logger,
        cache: CacheService
    ): Promise<AnalyticsService> {
        const service = new AnalyticsService();
        service.client = client;
        service.logger = logger;
        service.cache = cache;

        const database = client.database('xrwebsites-db-2024');
        service.analyticsContainer = database.container('analytics');

        return service;
    }

    async getUserEngagementMetrics(query: AnalyticsQuery) {
        const cacheKey = `user_metrics_${query.tenantId}_${query.timeframe}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const { resources } = await this.analyticsContainer.items
            .query({
                query: `
                    SELECT c.userId, c.action
                    FROM c
                    WHERE c.tenantId = @tenantId 
                    AND c.type = 'user_activity'
                `,
                parameters: [
                    { name: "@tenantId", value: query.tenantId }
                ]
            })
            .fetchAll();

        const metrics = {
            activeUsers: new Set(resources.map(r => r.userId)).size,
            totalActions: resources.length
        };

        await this.cache.set(cacheKey, JSON.stringify(metrics), 3600);
        return metrics;
    }

    async getPopularAssets(query: AnalyticsQuery) {
        const cacheKey = `asset_metrics_${query.tenantId}_${query.timeframe}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const { resources } = await this.analyticsContainer.items
            .query({
                query: `
                    SELECT * 
                    FROM c
                    WHERE c.tenantId = @tenantId 
                    AND c.type = 'asset_interaction'
                `,
                parameters: [
                    { name: "@tenantId", value: query.tenantId }
                ]
            })
            .fetchAll();

        // Process metrics in memory - only track views
        const metrics = resources.reduce((acc, r) => {
            if (!r.assetId) return acc;
            
            const existing = acc.find(m => m.assetId === r.assetId);
            if (existing) {
                existing.views++;
            } else {
                acc.push({ assetId: r.assetId, views: 1 });
            }
            return acc;
        }, [] as Array<{ assetId: string; views: number }>);

        await this.cache.set(cacheKey, JSON.stringify(metrics), 3600);
        return metrics;
    }

    async getJobBoardMetrics(query: AnalyticsQuery) {
        const cacheKey = `job_metrics_${query.tenantId}_${query.timeframe}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const { resources } = await this.analyticsContainer.items
            .query({
                query: `
                    SELECT * 
                    FROM c
                    WHERE c.tenantId = @tenantId 
                    AND c.type = 'job_activity'
                `,
                parameters: [
                    { name: "@tenantId", value: query.tenantId }
                ]
            })
            .fetchAll();

        // Process metrics in memory - only track counts
        const metrics = resources.reduce((acc, r) => {
            const existing = acc.find(m => m.action === r.action);
            if (existing) {
                existing.count++;
            } else {
                acc.push({ action: r.action, count: 1 });
            }
            return acc;
        }, [] as Array<{ action: string; count: number }>);

        await this.cache.set(cacheKey, JSON.stringify(metrics), 3600);
        return metrics;
    }

    async getWalletMetrics(query: AnalyticsQuery) {
        const cacheKey = `wallet_metrics_${query.tenantId}_${query.timeframe}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const { resources } = await this.analyticsContainer.items
            .query({
                query: `
                    SELECT * 
                    FROM c
                    WHERE c.tenantId = @tenantId 
                    AND c.type = 'wallet_transaction'
                `,
                parameters: [
                    { name: "@tenantId", value: query.tenantId }
                ]
            })
            .fetchAll();

        // Process metrics in memory - track amount and count
        const metrics = resources.reduce((acc, r) => {
            const existing = acc.find(m => m.action === r.action);
            if (existing) {
                existing.totalAmount += (r.amount || 0);
                existing.count++;
            } else {
                acc.push({ 
                    action: r.action, 
                    totalAmount: r.amount || 0, 
                    count: 1 
                });
            }
            return acc;
        }, [] as Array<{ action: string; totalAmount: number; count: number }>);

        await this.cache.set(cacheKey, JSON.stringify(metrics), 3600);
        return metrics;
    }

    private getStartTime(timeframe: string): string {
        const now = new Date();
        switch (timeframe) {
            case 'daily':
                now.setDate(now.getDate() - 1);
                break;
            case 'weekly':
                now.setDate(now.getDate() - 7);
                break;
            case 'monthly':
                now.setMonth(now.getMonth() - 1);
                break;
        }
        return now.toISOString();
    }
} 