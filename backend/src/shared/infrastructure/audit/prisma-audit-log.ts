import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AuditEntry, AuditLog } from '../../application/audit-log';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaAuditLog extends AuditLog {
  private readonly logger = new Logger(PrismaAuditLog.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: entry.companyId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: toJson(entry.before),
          after: toJson(entry.after),
        },
      });
    } catch (error) {
      // La auditoría no debe tumbar la operación principal, pero sí debe quedar en logs.
      this.logger.error(`No se pudo auditar ${entry.action}`, error as Error);
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  // Normaliza Dates y elimina undefined para que sea JSON válido.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
