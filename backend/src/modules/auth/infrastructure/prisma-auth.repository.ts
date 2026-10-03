import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { SecurityPolicy } from '../domain/account-security';
import { lockAfterFailure } from '../domain/account-security';
import type {
  ActiveMembership,
  AuthUser,
  NewSession,
  ResetTokenRecord,
  SessionRecord,
  SessionSummary,
} from '../domain/auth.types';
import { AuthRepository } from '../domain/ports/auth.repository';

const USER_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  status: true,
  isPlatformAdmin: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  lockedUntil: true,
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

  // ------------------------------------------------------------------
  // Seguridad de la cuenta
  // ------------------------------------------------------------------

  async registerFailedLogin(userId: string, policy: SecurityPolicy, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      // increment es atómico: dos intentos simultáneos no se "pierden"
      const { failedLoginAttempts } = await tx.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
      const lockedUntil = lockAfterFailure(failedLoginAttempts, policy, now);
      if (lockedUntil) {
        // Al bloquear se reinicia el contador: tras el bloqueo hay otros N intentos
        await tx.user.update({
          where: { id: userId },
          data: { lockedUntil, failedLoginAttempts: 0 },
        });
      }
      return { attempts: failedLoginAttempts, lockedUntil };
    });
  }

  async clearLoginFailures(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async revokeOtherSessions(
    userId: string,
    keepSessionId: string,
  ): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async listActiveSessions(userId: string): Promise<SessionSummary[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        companyId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const companyIds = [
      ...new Set(rows.map((r) => r.companyId).filter((c): c is string => !!c)),
    ];
    const companies = new Map(
      (
        await this.prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, name: true },
        })
      ).map((c) => [c.id, c.name]),
    );
    return rows.map((r) => ({
      ...r,
      companyName: r.companyId ? (companies.get(r.companyId) ?? null) : null,
    }));
  }

  async revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  }

  // ------------------------------------------------------------------
  // Recuperación de contraseña
  // ------------------------------------------------------------------

  countResetTokensSince(userId: string, since: Date): Promise<number> {
    return this.prisma.passwordResetToken.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  async createResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string;
  }): Promise<void> {
    await this.prisma.$transaction([
      // Solo el enlace más reciente sirve
      this.prisma.passwordResetToken.updateMany({
        where: { userId: data.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({ data }),
    ]);
  }

  findResetToken(tokenHash: string): Promise<ResetTokenRecord | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
  }

  async consumeResetToken(id: string): Promise<boolean> {
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }
}
