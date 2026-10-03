import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

/**
 * Contador de intentos en Redis, compartido entre TODAS las instancias del backend.
 * El script Lua se ejecuta de forma atómica: dos instancias que cuentan a la vez no se pisan.
 *
 * Unidades (contrato de @nestjs/throttler): ttl y blockDuration llegan en milisegundos;
 * timeToExpire y timeToBlockExpire se devuelven en segundos.
 */
const SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block = tonumber(ARGV[3])

local blockedFor = redis.call('PTTL', blockKey)
if blockedFor > 0 then
  return { tonumber(redis.call('GET', hitsKey) or limit + 1), redis.call('PTTL', hitsKey), 1, blockedFor }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then redis.call('PEXPIRE', hitsKey, ttl) end
local expiresIn = redis.call('PTTL', hitsKey)

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', block)
  return { hits, expiresIn, 1, block }
end
return { hits, expiresIn, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'throttle',
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const base = `${this.prefix}:${throttlerName}:${key}`;
    try {
      const [totalHits, expiresInMs, blocked, blockMs] = (await this.redis.eval(
        SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
      return {
        totalHits,
        timeToExpire: Math.max(0, Math.ceil(expiresInMs / 1000)),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
      };
    } catch (error) {
      // Si Redis cae, se prioriza la disponibilidad: se deja pasar y se registra.
      // (El bloqueo por intentos fallidos de cada cuenta sigue funcionando: vive en PostgreSQL.)
      this.logger.error(
        `Rate limit sin Redis, se deja pasar: ${(error as Error).message}`,
      );
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
