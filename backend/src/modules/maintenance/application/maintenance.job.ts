import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  cutoffs,
  DEFAULT_RETENTION,
  RetentionPolicy,
} from '../domain/retention';

const JOB = 'maintenance';

export interface MaintenanceResult {
  ran: boolean;
  locationsCleared: number;
  notificationsDeleted: number;
  sessionsDeleted: number;
  resetTokensDeleted: number;
}

/**
 * Limpieza periódica (MAINTENANCE_INTERVAL_SECONDS, por defecto cada hora):
 * - Retención de ubicaciones (Ley 1581 de 2012: no conservar datos personales más de lo
 *   necesario). Se borran las COORDENADAS; la marcación, su hora y si estaba dentro de la
 *   geocerca se conservan como evidencia.
 * - Notificaciones viejas, sesiones vencidas y enlaces de recuperación usados.
 * La auditoría NO se borra. Seguro con varias instancias (bloqueo en PostgreSQL).
 */
@Injectable()
export class MaintenanceJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceJob.name);
  private readonly policy: RetentionPolicy;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {
    const num = (key: string, fallback: number) =>
      Number(config.get(key) ?? fallback);
    this.policy = {
      ...DEFAULT_RETENTION,
      locationDays: num(
        'LOCATION_RETENTION_DAYS',
        DEFAULT_RETENTION.locationDays,
      ),
      notificationDays: num(
        'NOTIFICATION_RETENTION_DAYS',
        DEFAULT_RETENTION.notificationDays,
      ),
    };
  }

  onApplicationBootstrap() {
    const seconds = Number(
      this.config.get('MAINTENANCE_INTERVAL_SECONDS') ?? 3_600,
    );
    if (seconds <= 0) return;
    this.scheduler.addInterval(
      JOB,
      setInterval(() => void this.run(), seconds * 1000),
    );
  }

  onModuleDestroy() {
    if (this.scheduler.doesExist('interval', JOB))
      this.scheduler.deleteInterval(JOB);
  }

  async run(now = new Date()): Promise<MaintenanceResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const c = cutoffs(this.policy, now);
      const result = await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(hashtextextended('maintenance-job', 0)) AS locked`;
          if (!locked)
            return {
              ran: false,
              locationsCleared: 0,
              notificationsDeleted: 0,
              sessionsDeleted: 0,
              resetTokensDeleted: 0,
            };

          const events = await tx.attendanceEvent.updateMany({
            where: {
              serverTimestamp: { lt: c.location },
              latitude: { not: null },
            },
            data: {
              latitude: null,
              longitude: null,
              accuracyMeters: null,
              distanceMeters: null,
            },
          });
          const attendances = await tx.attendance.updateMany({
            where: {
              updatedAt: { lt: c.location },
              OR: [
                { clockInLatitude: { not: null } },
                { clockOutLatitude: { not: null } },
              ],
            },
            data: {
              clockInLatitude: null,
              clockInLongitude: null,
              clockInAccuracy: null,
              clockOutLatitude: null,
              clockOutLongitude: null,
              clockOutAccuracy: null,
            },
          });
          const notifications = await tx.notification.deleteMany({
            where: { createdAt: { lt: c.notifications } },
          });
          const sessions = await tx.session.deleteMany({
            where: {
              OR: [
                { revokedAt: { lt: c.sessions } },
                { expiresAt: { lt: c.sessions } },
              ],
            },
          });
          const tokens = await tx.passwordResetToken.deleteMany({
            where: {
              OR: [
                { expiresAt: { lt: c.resetTokens } },
                { usedAt: { lt: c.resetTokens } },
              ],
            },
          });
          return {
            ran: true,
            locationsCleared: events.count + attendances.count,
            notificationsDeleted: notifications.count,
            sessionsDeleted: sessions.count,
            resetTokensDeleted: tokens.count,
          };
        },
        { timeout: 120_000 },
      );
      if (
        result.ran &&
        Object.values(result).some((v) => typeof v === 'number' && v > 0)
      ) {
        this.logger.log(`Mantenimiento: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (error) {
      this.logger.error('Falló el mantenimiento', error as Error);
      return null;
    } finally {
      this.running = false;
    }
  }
}
