import { Global, Module } from '@nestjs/common';

import { AuditLog } from '../../application/audit-log';
import { PrismaAuditLog } from './prisma-audit-log';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({
  providers: [{ provide: AuditLog, useClass: PrismaAuditLog }],
  exports: [AuditLog],
})
export class AuditModule {}
