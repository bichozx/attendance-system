import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../shared/auth/public.decorator';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/infrastructure/redis/redis.service';

const TIMEOUT_MS = 2_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`sin respuesta en ${TIMEOUT_MS} ms`)),
        TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Para el orquestador (Docker, Railway, Kubernetes...):
 * - live: el proceso responde. Si falla → reiniciar el contenedor.
 * - ready: puede atender (base de datos y Redis disponibles). Si falla → no enviarle tráfico.
 * Sin prefijo /api/v1, sin autenticación y sin rate limit.
 */
@ApiTags('Salud')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'El proceso está vivo' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Listo para atender (base de datos y Redis)' })
  ready() {
    return this.health.check([
      async () => {
        const db = this.indicators.check('database');
        try {
          await withTimeout(this.prisma.$queryRaw`SELECT 1`);
          return db.up();
        } catch (e) {
          return db.down({ message: (e as Error).message });
        }
      },
      async () => {
        const redis = this.indicators.check('redis');
        if (!this.redis.client) return redis.up({ configured: false });
        return (await withTimeout(this.redis.ping()).catch(() => false))
          ? redis.up({ configured: true })
          : redis.down({ configured: true });
      },
    ]);
  }
}
