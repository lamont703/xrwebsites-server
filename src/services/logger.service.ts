import { Container, CosmosClient } from '@azure/cosmos';
import { Request } from 'express';

export interface LogEvent {
    id?: string;
    tenantId: string;
    eventType: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    timestamp?: string;
    actor: {
        id: string;
        type: 'user' | 'system' | 'admin' | 'service';
        ip?: string;
        userAgent?: string;
    };
    target?: {
        id: string;
        type: 'user' | 'job' | 'asset' | 'payment' | 'system';
        name?: string;
    };
    changes?: {
        before: any;
        after: any;
    };
    metadata?: Record<string, any>;
    status: 'success' | 'failure' | 'pending';
}

export class Logger {
    private logsContainer: Container;
    private static instance: Logger;

    private constructor(container: Container) {
        this.logsContainer = container;
    }

    static async initialize(client: CosmosClient): Promise<Logger> {
        if (!Logger.instance) {
            const database = client.database('XRWebsites');
            const { container } = await database.containers.createIfNotExists({
                id: 'logs',
                partitionKey: { paths: ["/tenantId"] }
            });
            Logger.instance = new Logger(container);
        }
        return Logger.instance;
    }

    async log(event: LogEvent): Promise<void> {
        try {
            const logEntry = {
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                ...event
            };

            await this.logsContainer.items.create(logEntry);
        } catch (error) {
            console.error('Failed to write log:', error);
            // For critical errors, we might want to use a fallback logging mechanism
            if (event.severity === 'critical') {
                this.fallbackLog(event);
            }
        }
    }

    private fallbackLog(event: LogEvent): void {
        // Fallback to file system or console in case DB logging fails
        console.error('CRITICAL LOG (Fallback):', JSON.stringify(event, null, 2));
    }

    // Helper methods for common events
    async logUserAction(
        req: Request,
        eventType: string,
        tenantId: string,
        targetId: string,
        targetType: string,
        changes?: { before: any; after: any }
    ): Promise<void> {
        const event: LogEvent = {
            tenantId,
            eventType,
            severity: 'info',
            actor: {
                id: req.user?.id || 'anonymous',
                type: 'user',
                ip: req.ip,
                userAgent: req.get('user-agent')
            },
            target: {
                id: targetId,
                type: targetType as any,
                name: targetType
            },
            changes,
            status: 'success',
            metadata: {
                path: req.path,
                method: req.method
            }
        };

        await this.log(event);
    }

    async logSystemEvent(
        tenantId: string,
        eventType: string,
        severity: 'info' | 'warning' | 'error' | 'critical',
        details: any
    ): Promise<void> {
        const event: LogEvent = {
            tenantId,
            eventType,
            severity,
            actor: {
                id: 'system',
                type: 'system'
            },
            target: {
                id: 'system',
                type: 'system'
            },
            status: 'success',
            metadata: details
        };

        await this.log(event);
    }

    async logError(
        tenantId: string,
        error: Error,
        context: Record<string, any> = {}
    ): Promise<void> {
        const event: LogEvent = {
            tenantId,
            eventType: 'system.error',
            severity: 'error',
            actor: {
                id: 'system',
                type: 'system'
            },
            status: 'failure',
            metadata: {
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                },
                context
            }
        };

        await this.log(event);
    }
} 