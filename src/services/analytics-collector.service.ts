import { CosmosClient, Container } from '@azure/cosmos';
import { Logger } from './logger.service';

interface AnalyticsEvent {
    id?: string;
    tenantId: string;
    type: 'user_activity' | 'asset_interaction' | 'job_activity' | 'wallet_transaction' | 'subscription_event';
    action: string;
    timestamp: Date;
    userId?: string;
    metadata: Record<string, any>;
    source?: string;
}

interface AssetEvent {
    tenantId: string;
    assetId: string;
    userId: string;
    action: 'view' | 'download' | 'purchase';
    category: string;
    metadata: Record<string, any>;
}

interface JobEvent {
    tenantId: string;
    jobId: string;
    userId: string;
    action: 'post' | 'view' | 'apply';
    category: string;
    payRate?: number;
    metadata: Record<string, any>;
}

interface WalletEvent {
    tenantId: string;
    walletId: string;
    userId: string;
    action: 'deposit' | 'withdraw' | 'transfer';
    amount: number;
    currency: string;
    metadata: Record<string, any>;
}

export class AnalyticsCollector {
    private client: CosmosClient;
    private analyticsContainer: Container;
    private logger: Logger;
    private batchSize: number = 100;
    private batchTimeout: number = 5000; // 5 seconds
    private eventQueue: AnalyticsEvent[] = [];
    private batchTimer?: NodeJS.Timeout;

    static async initialize(
        client: CosmosClient,
        logger: Logger
    ): Promise<AnalyticsCollector> {
        const collector = new AnalyticsCollector();
        collector.client = client;
        collector.logger = logger;

        const database = client.database('xrwebsites-db-2024');
        collector.analyticsContainer = database.container('analytics');

        // Start batch processing
        collector.processBatch();

        return collector;
    }

    async trackUserActivity(
        tenantId: string,
        userId: string,
        action: string,
        metadata: Record<string, any> = {}
    ): Promise<void> {
        await this.queueEvent({
            tenantId,
            type: 'user_activity',
            action,
            userId,
            timestamp: new Date(),
            metadata,
            source: 'web'
        });
    }

    async trackAssetInteraction(event: AssetEvent): Promise<void> {
        await this.queueEvent({
            tenantId: event.tenantId,
            type: 'asset_interaction',
            action: event.action,
            userId: event.userId,
            assetId: event.assetId,
            category: event.category,
            timestamp: new Date(),
            metadata: event.metadata,
            source: 'web'
        });

        // Update asset stats
        await this.updateAssetStats(event);
    }

    async trackJobActivity(event: JobEvent): Promise<void> {
        await this.queueEvent({
            tenantId: event.tenantId,
            type: 'job_activity',
            action: event.action,
            userId: event.userId,
            jobId: event.jobId,
            category: event.category,
            payRate: event.payRate,
            timestamp: new Date(),
            metadata: event.metadata,
            source: 'web'
        });

        // Update job stats
        await this.updateJobStats(event);
    }

    async trackWalletActivity(event: WalletEvent): Promise<void> {
        await this.queueEvent({
            tenantId: event.tenantId,
            type: 'wallet_transaction',
            action: event.action,
            userId: event.userId,
            walletId: event.walletId,
            amount: event.amount,
            currency: event.currency,
            timestamp: new Date(),
            metadata: event.metadata,
            source: 'web'
        });

        // Update wallet stats
        await this.updateWalletStats(event);
    }

    private async queueEvent(event: AnalyticsEvent): Promise<void> {
        // Add unique ID if not provided
        if (!event.id) {
            event.id = `${event.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        this.eventQueue.push(event);

        // Process batch if queue is full
        if (this.eventQueue.length >= this.batchSize) {
            await this.processBatch();
        }
    }

    private async processBatch(): Promise<void> {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }

        if (this.eventQueue.length === 0) {
            this.scheduleBatch();
            return;
        }

        const batch = this.eventQueue.splice(0, this.batchSize);
        console.log(`\nProcessing batch of ${batch.length} events...`);

        try {
            // Create container if it doesn't exist
            const database = this.client.database('xrwebsites-db-2024');
            const { container } = await database.containers.createIfNotExists({
                id: 'analytics',
                partitionKey: '/tenantId'
            });
            this.analyticsContainer = container;

            // Bulk insert events with better error handling
            for (const event of batch) {
                try {
                    await this.analyticsContainer.items.create(event);
                    console.log(`✓ Created event: ${event.type} - ${event.action}`);
                } catch (error) {
                    console.error(`Failed to create event: ${event.type}`, error);
                    // Re-queue failed event
                    this.eventQueue.unshift(event);
                }
            }

            await this.logger.log({
                tenantId: 'system',
                eventType: 'analytics.batch.processed',
                severity: 'info',
                metadata: {
                    batchSize: batch.length,
                    eventTypes: batch.map(e => e.type),
                    success: true
                }
            });

            console.log(`\n✓ Successfully processed ${batch.length} events`);
        } catch (error) {
            console.error('Batch processing failed:', error);
            
            await this.logger.logError('system', error as Error, {
                component: 'AnalyticsCollector',
                operation: 'processBatch',
                batchSize: batch.length
            });
            
            // Requeue failed events
            this.eventQueue.unshift(...batch);
        }

        // Schedule next batch
        this.scheduleBatch();
    }

    private scheduleBatch(): void {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        this.batchTimer = setTimeout(() => {
            console.log('\nScheduled batch processing starting...');
            this.processBatch();
        }, this.batchTimeout);
    }

    private async updateAssetStats(event: AssetEvent): Promise<void> {
        const container = this.client.database('xrwebsites-db-2024').container('assets');
        const { resource: asset } = await container.item(event.assetId, event.tenantId).read();

        if (asset) {
            const updates = {
                views: event.action === 'view' ? (asset.views || 0) + 1 : asset.views || 0,
                downloads: event.action === 'download' ? (asset.downloads || 0) + 1 : asset.downloads || 0,
                purchases: event.action === 'purchase' ? (asset.purchases || 0) + 1 : asset.purchases || 0
            };

            await container.item(event.assetId, event.tenantId).patch([
                { op: 'set', path: '/views', value: updates.views },
                { op: 'set', path: '/downloads', value: updates.downloads },
                { op: 'set', path: '/purchases', value: updates.purchases }
            ]);
        }
    }

    private async updateJobStats(event: JobEvent): Promise<void> {
        const container = this.client.database('xrwebsites-db-2024').container('jobs');
        const { resource: job } = await container.item(event.jobId, event.tenantId).read();

        if (job) {
            const updates = {
                views: event.action === 'view' ? (job.views || 0) + 1 : job.views || 0,
                applications: event.action === 'apply' ? (job.applications || 0) + 1 : job.applications || 0
            };

            await container.item(event.jobId, event.tenantId).patch([
                { op: 'set', path: '/views', value: updates.views },
                { op: 'set', path: '/applications', value: updates.applications }
            ]);
        }
    }

    private async updateWalletStats(event: WalletEvent): Promise<void> {
        const container = this.client.database('xrwebsites-db-2024').container('wallets');
        const { resource: wallet } = await container.item(event.walletId, event.tenantId).read();

        if (wallet) {
            const balance = wallet.balance || 0;
            const newBalance = event.action === 'deposit' 
                ? balance + event.amount 
                : event.action === 'withdraw' 
                    ? balance - event.amount 
                    : balance;

            await container.item(event.walletId, event.tenantId).patch([
                { op: 'set', path: '/balance', value: newBalance },
                { op: 'set', path: '/lastUpdated', value: new Date().toISOString() }
            ]);
        }
    }

    public async processBatchNow(): Promise<void> {
        await this.processBatch();
    }

    public async stopBatchProcessing(): Promise<void> {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
    }
}