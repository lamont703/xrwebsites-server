import Redis from 'ioredis';
import { Logger } from './logger.service';

interface CacheConfig {
    host: string;
    key: string;
    port: number;
}

interface CacheOptions {
    ttl?: number;  // Time to live in seconds
    tags?: string[];  // For cache invalidation by category
}

export class CacheService {
    private static instance: CacheService;
    private redis: Redis;
    private logger: Logger;

    private defaultTTL = 3600; // 1 hour
    private prefix = 'xrw:'; // Prefix for all keys

    private constructor(redis: Redis, logger: Logger) {
        this.redis = redis;
        this.logger = logger;
    }

    static async initialize(config: CacheConfig, logger: Logger): Promise<CacheService> {
        if (!CacheService.instance) {
            const redis = new Redis({
                host: config.host,
                port: config.port,
                password: config.key,
                tls: { servername: config.host },
                retryStrategy(times) {
                    const delay = Math.min(times * 100, 2000);
                    return delay;
                }
            });

            redis.on('error', (err) => {
                logger.logError('system', err, {
                    component: 'CacheService',
                    operation: 'RedisConnection'
                });
            });

            CacheService.instance = new CacheService(redis, logger);
        }
        return CacheService.instance;
    }

    private getKey(key: string, tenantId?: string): string {
        return `${this.prefix}${tenantId ? `${tenantId}:` : ''}${key}`;
    }

    private getTagKey(tag: string): string {
        return `${this.prefix}tag:${tag}`;
    }

    async get<T>(key: string, tenantId?: string): Promise<T | null> {
        try {
            const value = await this.redis.get(this.getKey(key, tenantId));
            return value ? JSON.parse(value) : null;
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'get',
                key
            });
            return null;
        }
    }

    async set(
        key: string, 
        value: any, 
        options: CacheOptions = {},
        tenantId?: string
    ): Promise<void> {
        try {
            const cacheKey = this.getKey(key, tenantId);
            const serializedValue = JSON.stringify(value);
            
            if (options.ttl) {
                await this.redis.setex(cacheKey, options.ttl, serializedValue);
            } else {
                await this.redis.set(cacheKey, serializedValue, 'EX', this.defaultTTL);
            }

            // Store key in tag sets if tags are provided
            if (options.tags?.length) {
                const multi = this.redis.multi();
                for (const tag of options.tags) {
                    multi.sadd(this.getTagKey(tag), cacheKey);
                }
                await multi.exec();
            }
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'set',
                key
            });
        }
    }

    async invalidate(key: string, tenantId?: string): Promise<void> {
        try {
            await this.redis.del(this.getKey(key, tenantId));
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'invalidate',
                key
            });
        }
    }

    async invalidateByTag(tag: string): Promise<void> {
        try {
            const tagKey = this.getTagKey(tag);
            const keys = await this.redis.smembers(tagKey);
            
            if (keys.length) {
                const multi = this.redis.multi();
                multi.del(...keys);  // Delete all cached items
                multi.del(tagKey);   // Delete the tag set
                await multi.exec();
            }
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'invalidateByTag',
                tag
            });
        }
    }

    async invalidateByPattern(pattern: string): Promise<void> {
        try {
            const keys = await this.redis.keys(`${this.prefix}${pattern}`);
            if (keys.length) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'invalidateByPattern',
                pattern
            });
        }
    }

    // Helper methods for common caching scenarios
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        options: CacheOptions = {},
        tenantId?: string
    ): Promise<T | null> {
        try {
            const cached = await this.get<T>(key, tenantId);
            if (cached) {
                return cached;
            }

            const value = await fetchFn();
            await this.set(key, value, options, tenantId);
            return value;
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'getOrSet',
                key
            });
            return null;
        }
    }

    // Cache warm-up methods
    async warmUpCache(
        keys: Array<{ key: string; fetchFn: () => Promise<any>; options?: CacheOptions }>,
        tenantId?: string
    ): Promise<void> {
        try {
            await Promise.all(
                keys.map(({ key, fetchFn, options }) => 
                    this.getOrSet(key, fetchFn, options, tenantId)
                )
            );
        } catch (error) {
            await this.logger.logError('system', error as Error, {
                component: 'CacheService',
                operation: 'warmUpCache'
            });
        }
    }
} 