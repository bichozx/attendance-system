import { Injectable, Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../../generated/prisma/client';

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

@Injectable()
export class PrismaService extends PrismaClient {
  private static readonly logger = new Logger('Database');

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL debe estar configurada');
    }

    const pool = new Pool({
      connectionString,
      max: num(process.env.DATABASE_POOL_MAX, 10),
      // Cerrar conexiones ociosas antes de que el equipo (o la red) las deje muertas:
      // tras una suspensión o un reinicio de Postgres, la siguiente consulta abre una nueva
      idleTimeoutMillis: 30_000,
      // Esperar más que el valor por defecto de Prisma (2 s) al abrir una conexión nueva
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
    // Una conexión ociosa que se cae emite 'error'; sin este listener, el proceso se cae
    pool.on('error', (error) =>
      PrismaService.logger.warn(
        `Se cerró una conexión ociosa con la base: ${error.message}`,
      ),
    );

    super({ adapter: new PrismaPg(pool) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
