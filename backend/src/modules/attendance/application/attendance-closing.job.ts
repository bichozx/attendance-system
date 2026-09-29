import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Notifier } from '../../../shared/application/notifier';
import { SHIFT_LIMITS } from '../../shifts/domain/shift.rules';
import { describeDay } from '../../shifts/application/shift-time';
import { utcToLocal } from '../../../shared/domain/zoned-time';
import { AttendanceRepository } from '../domain/attendance.repository';

const JOB_NAME = 'attendance-closing';

/**
 * Cada N segundos (ATTENDANCE_JOB_INTERVAL_SECONDS, por defecto 300):
 * - Jornadas con entrada y sin salida cuya ventana cerró → INCOMPLETE (+ aviso al empleado).
 * - Turnos terminados sin ninguna entrada → ABSENT.
 * Ambas quedan en la bandeja de revisión. Es seguro con varias instancias del backend:
 * el repositorio usa un bloqueo para que solo una lo ejecute a la vez.
 */
@Injectable()
export class AttendanceClosingJob
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AttendanceClosingJob.name);

  constructor(
    private readonly repo: AttendanceRepository,
    private readonly notifier: Notifier,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const seconds = Number(
      this.config.get('ATTENDANCE_JOB_INTERVAL_SECONDS') ?? 300,
    );
    if (seconds <= 0) return; // 0 = desactivado
    const interval = setInterval(() => void this.run(), seconds * 1000);
    this.scheduler.addInterval(JOB_NAME, interval);
  }

  onModuleDestroy() {
    if (this.scheduler.doesExist('interval', JOB_NAME))
      this.scheduler.deleteInterval(JOB_NAME);
  }

  async run(now = new Date()) {
    try {
      const result = await this.repo.closeOverdue(
        now,
        SHIFT_LIMITS.clockOutGraceMinutes,
      );
      if (!result.ran) return result;

      await this.notifier.notify(
        result.incomplete
          .filter((i) => i.userId)
          .map((i) => ({
            companyId: i.companyId,
            userId: i.userId!,
            type: 'MISSING_CLOCK_OUT' as const,
            title: 'No registraste tu salida',
            body:
              `En tu turno del ${describeDay(i.shiftStartsAt, i.timeZone)} ` +
              `(${utcToLocal(i.shiftStartsAt, i.timeZone).time}) no quedó registrada la salida. ` +
              'Tu supervisor revisará la jornada.',
          })),
      );
      if (result.incomplete.length || result.absent) {
        this.logger.log(
          `Cierre de jornadas: ${result.incomplete.length} sin salida, ${result.absent} ausencias`,
        );
      }
      return result;
    } catch (error) {
      this.logger.error('Falló el cierre de jornadas', error as Error);
      return null;
    }
  }
}
