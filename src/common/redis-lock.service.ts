import { Injectable } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService {
  private readonly redis: Redis;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrNil();
  }

  private serialize(value: any): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  private deserialize(value: string | null): any {
    if (value === null) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async acquire(key: string, value: any, ttlMs: number): Promise<boolean> {
    const serializedValue = this.serialize(value);
    const result = await this.redis.set(
      key,
      serializedValue,
      'PX',
      ttlMs,
      'NX',
    );
    const ttl = await this.redis.pttl(key);
    console.log(`[RedisLockService] ACQUIRE ${key} => ${result}, TTL=${ttl}ms`);
    return result === 'OK';
  }

  async release(key: string, value: any): Promise<boolean> {
    const lua = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end`;
    const serializedValue = this.serialize(value);
    const deleted = await this.redis.eval(lua, 1, key, serializedValue);
    console.log(`[RedisLockService] RELEASE ${key} => ${deleted}`);
    return deleted === 1;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const current = await this.redis.get(key);
    const parsed = this.deserialize(current);
    console.log(`[RedisLockService] GET ${key} =>`, parsed);
    return parsed;
  }

  async exists(key: string, value: any): Promise<boolean> {
    const current = await this.redis.get(key);
    const parsed = this.deserialize(current);
    const checkValue = this.deserialize(this.serialize(value));
    const isEqual = JSON.stringify(parsed) === JSON.stringify(checkValue);
    console.log(`[RedisLockService] EXISTS ${key} => ${isEqual}`);
    return isEqual;
  }
}
