import type {
  ActiveMembership,
  AuthUser,
  NewSession,
  SessionRecord,
} from '../domain/auth.types';

import { AuthRepository } from '../domain/ports/auth.repository';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

const USER_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  status: true,
  isPlatformAdmin: true,
} as const;

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findUserByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_SELECT,
    });
  }

  findUserById(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  async findActiveMemberships(userId: string): Promise<ActiveMembership[]> {
    const rows = await this.prisma.companyMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        company: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
      },
      select: {
        company: { select: { id: true, name: true, slug: true } },
        role: {
          select: {
            code: true,
            name: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
      orderBy: { company: { name: 'asc' } },
    });

    return rows.map((row) => ({
      companyId: row.company.id,
      companyName: row.company.name,
      companySlug: row.company.slug,
      roleCode: row.role.code,
      roleName: row.role.name,
      permissions: row.role.permissions.map((rp) => rp.permission.code),
    }));
  }

  async recordLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async createSession(session: NewSession): Promise<void> {
    await this.prisma.session.create({ data: session });
  }

  findSessionById(id: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        companyId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async rotateSession(
    id: string,
    currentHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    // Actualización condicional atómica: solo una petición concurrente puede ganar.
    const result = await this.prisma.session.updateMany({
      where: { id, refreshTokenHash: currentHash, revokedAt: null },
      data: { refreshTokenHash: newHash, expiresAt },
    });
    return result.count === 1;
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
