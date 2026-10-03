import { Global, Module } from '@nestjs/common';
import { AuditLog } from '../../application/audit-log';
import { PrismaAuditLog } from './prisma-audit-log';

@Global()
@Module({
  providers: [{ provide: AuditLog, useClass: PrismaAuditLog }],
  exports: [AuditLog],
})
export class AuditModule {}
