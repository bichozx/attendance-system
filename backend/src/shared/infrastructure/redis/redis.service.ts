import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cliente de Redis OPCIONAL: solo existe si hay REDIS_URL.
 * Hoy se usa para que el límite de intentos sea compartido entre instancias.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    this.client = url
      ? new Redis(url, {
          lazyConnect: false,
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false, // si Redis cae, fallar rápido en vez de acumular comandos
          connectTimeout: 3_000,
        })
      : null;
    this.client?.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
  }

  async ping(): Promise<boolean> {
    if (!this.client) return true;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }
}
