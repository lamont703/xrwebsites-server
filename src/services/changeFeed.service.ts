import { Container, CosmosClient, Database } from "@azure/cosmos";
import { WebSocketServer } from 'ws';

export class ChangeFeedProcessor {
    private client: CosmosClient;
    private database: Database;
    private containers: { [key: string]: Container };
    private wss: WebSocketServer;
    private lastProcessedTime: number;
    private isProcessing: boolean = false;

    constructor(client: CosmosClient, wss: WebSocketServer) {
        this.client = client;
        this.wss = wss;
        this.containers = {};
        // Start from 60 seconds ago to ensure we catch changes
        this.lastProcessedTime = Math.floor(Date.now() / 1000) - 60;
        
        console.log('ChangeFeedProcessor starting up');
        console.log('Current time:', new Date().toISOString());
        console.log('Initial lastProcessedTime:', this.lastProcessedTime);
        console.log('Looking for changes since:', new Date(this.lastProcessedTime * 1000).toISOString());
    }

    async init() {
        try {
            this.database = this.client.database('XRWebsites');
            
            // Initialize containers we want to monitor
            this.containers = {
                jobs: this.database.container('jobs'),
                assets: this.database.container('assets'),
                transactions: this.database.container('transactions'),
                messages: this.database.container('messages')
            };

            console.log('ChangeFeedProcessor initialized');
            console.log('Initial timestamp:', this.lastProcessedTime, 
                      'Local time:', new Date(this.lastProcessedTime * 1000).toISOString());
            
            // Start change feed processors
            await this.startChangeFeedProcessors();
        } catch (error) {
            console.error('Error initializing ChangeFeedProcessor:', error);
            throw error;
        }
    }

    private async startChangeFeedProcessors() {
        try {
            // Check for changes every second
            setInterval(async () => {
                if (!this.isProcessing) {
                    await this.checkForChanges();
                }
            }, 1000);

            console.log('Change feed processor started for jobs container');
        } catch (error) {
            console.error('Error starting change feed processors:', error);
            throw error;
        }
    }

    private async checkForChanges() {
        this.isProcessing = true;
        try {
            const querySpec = {
                query: "SELECT * FROM c WHERE c._ts > @lastProcessedTime ORDER BY c._ts ASC",
                parameters: [
                    {
                        name: "@lastProcessedTime",
                        value: this.lastProcessedTime
                    }
                ]
            };

            // Log every check attempt
            console.log(`[${new Date().toISOString()}] Checking for changes:`);
            console.log(`- Last processed time: ${this.lastProcessedTime}`);
            console.log(`- Connected clients: ${this.wss.clients.size}`);
            
            const { resources } = await this.containers.jobs.items
                .query(querySpec)
                .fetchAll();

            if (resources && resources.length > 0) {
                console.log('=== Found Changes ===');
                console.log(`Number of changes: ${resources.length}`);
                resources.forEach(r => console.log({
                    id: r.id,
                    _ts: r._ts,
                    title: r.title,
                    creatorId: r.creatorId,
                    timestamp: new Date(r._ts * 1000).toISOString()
                }));
                
                let maxTimestamp = this.lastProcessedTime;
                
                for (const change of resources) {
                    await this.handleJobChange(change);
                    if (change._ts > maxTimestamp) {
                        maxTimestamp = change._ts;
                    }
                }

                this.lastProcessedTime = maxTimestamp;
                console.log(`Updated lastProcessedTime to: ${this.lastProcessedTime}`);
            }
        } catch (error) {
            console.error('Error reading changes:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async handleJobChange(change: any) {
        try {
            console.log('Processing job change:', {
                id: change.id,
                _ts: change._ts,
                title: change.title,
                creatorId: change.creatorId
            });
            
            // Create notification
            const notification = {
                id: `notif_${Date.now()}`,
                userId: change.creatorId,
                type: 'job_update',
                status: 'unread',
                data: {
                    entityId: change.id,
                    entityType: 'job',
                    action: 'changed',
                    preview: `Job "${change.title}" was updated`,
                    timestamp: new Date(change._ts * 1000).toISOString(),
                    jobData: change
                },
                timestamp: new Date().toISOString()
            };

            // Log connected clients
            console.log(`Broadcasting to ${this.wss.clients.size} connected clients`);

            // Broadcast to WebSocket clients
            let clientCount = 0;
            this.wss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(JSON.stringify({
                        type: 'notification',
                        data: notification
                    }));
                    clientCount++;
                }
            });

            console.log(`Notification sent to ${clientCount} clients`);
        } catch (error) {
            console.error('Error handling job change:', error);
        }
    }
} 