import { Container, CosmosClient } from '@azure/cosmos';
import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';
import { Logger } from './logger.service.js';

interface RateLimit {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
    concurrentRequests?: number;
}

interface RateLimitConfig {
    tenantId: string;
    type: 'api' | 'endpoint' | 'user' | 'ip';
    target: string;
    limits: RateLimit;
}

export class RateLimiter {
    private static instance: RateLimiter;
    private redis: Redis;
    private limitsContainer: Container;
    private logger: Logger;

    private defaultLimits: RateLimit = {
        requestsPerSecond: 10,
        requestsPerMinute: 300,
        requestsPerHour: 3600,
        requestsPerDay: 50000,
        concurrentRequests: 50
    };

    private constructor(redis: Redis, container: Container, logger: Logger) {
        this.redis = redis;
        this.limitsContainer = container;
        this.logger = logger;
    }

    static async initialize(
        client: CosmosClient,
        logger: Logger,
        config: {
            host: string,
            key: string,
            port: number
        }
    ): Promise<RateLimiter> {
        if (!RateLimiter.instance) {
            // Enhanced Redis configuration
            const redis = new Redis({
                host: config.host,
                port: config.port,
                password: config.key,
                tls: { servername: config.host },
                connectTimeout: 10000,
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    const delay = Math.min(times * 100, 2000);
                    return delay;
                },
                reconnectOnError(err) {
                    const targetError = 'READONLY';
                    if (err.message.includes(targetError)) {
                        return true;
                    }
                    return false;
                }
            });

            // Add connection event handlers
            redis.on('connect', () => {
                console.log('Successfully connected to Azure Redis Cache');
            });

            redis.on('error', (err) => {
                console.error('Redis connection error:', err);
                logger.logError('system', err, {
                    component: 'RateLimiter',
                    operation: 'RedisConnection'
                });
            });

            redis.on('ready', () => {
                console.log('Redis client is ready');
            });

            const database = client.database('XRWebsites');
            const { container } = await database.containers.createIfNotExists({
                id: 'rateLimits',
                partitionKey: { paths: ["/tenantId"] }
            });
            RateLimiter.instance = new RateLimiter(redis, container, logger);
        }
        return RateLimiter.instance;
    }

    private getKey(tenantId: string, type: string, target: string, window: string): string {
        return `ratelimit:${tenantId}:${type}:${target}:${window}`;
    }

    private async increment(key: string, windowSeconds: number): Promise<number> {
        const multi = this.redis.multi();
        multi.incr(key);
        multi.expire(key, windowSeconds);
        const results = await multi.exec();
        return results ? (results[0][1] as number) : 0;
    }

    private async checkLimit(
        tenantId: string,
        type: string,
        target: string,
        limits: RateLimit
    ): Promise<boolean> {
        const checks = [];

        if (limits.requestsPerSecond) {
            const key = this.getKey(tenantId, type, target, 'second');
            const count = await this.increment(key, 1);
            checks.push(count <= limits.requestsPerSecond);
        }

        if (limits.requestsPerMinute) {
            const key = this.getKey(tenantId, type, target, 'minute');
            const count = await this.increment(key, 60);
            checks.push(count <= limits.requestsPerMinute);
        }

        if (limits.requestsPerHour) {
            const key = this.getKey(tenantId, type, target, 'hour');
            const count = await this.increment(key, 3600);
            checks.push(count <= limits.requestsPerHour);
        }

        if (limits.requestsPerDay) {
            const key = this.getKey(tenantId, type, target, 'day');
            const count = await this.increment(key, 86400);
            checks.push(count <= limits.requestsPerDay);
        }

        return checks.every(check => check);
    }

    async getRateLimit(config: RateLimitConfig): Promise<RateLimit> {
        try {
            const query = {
                query: "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.type = @type AND c.target = @target",
                parameters: [
                    { name: "@tenantId", value: config.tenantId },
                    { name: "@type", value: config.type },
                    { name: "@target", value: config.target }
                ]
            };

            const { resources } = await this.limitsContainer.items.query(query).fetchAll();
            return resources[0]?.limits || this.defaultLimits;
        } catch (error) {
            await this.logger.logError(config.tenantId, error as Error, {
                component: 'RateLimiter',
                operation: 'getRateLimit'
            });
            return this.defaultLimits;
        }
    }

    middleware(config: Partial<RateLimitConfig> = {}) {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const tenantId = config.tenantId || req.headers['x-tenant-id'] as string;
                const userId = req.user?.id || 'anonymous';
                const ip = req.ip;

                // Check tenant-level limits
                const tenantLimits = await this.getRateLimit({
                    tenantId,
                    type: 'api',
                    target: 'tenant',
                    limits: this.defaultLimits
                });

                const tenantAllowed = await this.checkLimit(
                    tenantId,
                    'api',
                    'tenant',
                    tenantLimits
                );

                if (!tenantAllowed) {
                    await this.logger.log({
                        tenantId,
                        eventType: 'system.ratelimit',
                        severity: 'warning',
                        actor: {
                            id: userId,
                            type: 'user',
                            ip
                        },
                        status: 'failure',
                        metadata: {
                            type: 'tenant',
                            limits: tenantLimits
                        }
                    });

                    res.status(429).json({
                        error: 'Rate limit exceeded',
                        type: 'tenant'
                    });
                    return;
                }

                // Check user-level limits
                const userLimits = await this.getRateLimit({
                    tenantId,
                    type: 'user',
                    target: userId,
                    limits: this.defaultLimits
                });

                const userAllowed = await this.checkLimit(
                    tenantId,
                    'user',
                    userId,
                    userLimits
                );

                if (!userAllowed) {
                    await this.logger.log({
                        tenantId,
                        eventType: 'system.ratelimit',
                        severity: 'warning',
                        actor: {
                            id: userId,
                            type: 'user',
                            ip
                        },
                        status: 'failure',
                        metadata: {
                            type: 'user',
                            limits: userLimits
                        }
                    });

                    res.status(429).json({
                        error: 'Rate limit exceeded',
                        type: 'user'
                    });
                    return;
                }

                // Add rate limit headers
                res.setHeader('X-RateLimit-Limit', userLimits.requestsPerMinute || 0);
                res.setHeader('X-RateLimit-Remaining', (userLimits.requestsPerMinute || 0) - 1);

                next();
            } catch (error) {
                next(error);
            }
        };
    }
} 