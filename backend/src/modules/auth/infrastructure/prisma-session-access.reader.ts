import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  LiveSessionAccess,
  SessionAccessReader,
} from '../domain/ports/session-access.reader';

/** Una sola consulta por petición: sesión + cuenta + membresía + empresa + permisos. */
@Injectable()
export class PrismaSessionAccessReader extends SessionAccessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(sessionId: string): Promise<LiveSessionAccess | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        companyId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            status: true,
            isPlatformAdmin: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (!session) return null;

    let permissions: string[] | null = null;
    if (session.companyId) {
      const membership = await this.prisma.companyMembership.findFirst({
        where: {
          userId: session.userId,
          companyId: session.companyId,
          status: 'ACTIVE',
          company: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
        },
        select: {
          role: {
            select: {
              permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      });
      permissions =
        membership?.role.permissions.map((rp) => rp.permission.code) ?? null;
    }

    return {
      userId: session.userId,
      companyId: session.companyId,
      revokedAt: session.revokedAt,
      expiresAt: session.expiresAt,
      userStatus: session.user.status,
      isPlatformAdmin: session.user.isPlatformAdmin,
      mustChangePassword: session.user.mustChangePassword,
      permissions,
    };
  }
}
