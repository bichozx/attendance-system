import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../../shared/application/audit-log';
import { InvalidResetTokenError } from '../../domain/auth.errors';
import { AuthRepository } from '../../domain/ports/auth.repository';
import { PasswordHasher } from '../../domain/ports/password-hasher';
import { SecretTokens } from '../../domain/ports/secret-tokens';
import type { AuthUser } from '../../domain/auth.types';
import { AccountEmails } from '../account-emails';
import { AuthSettings } from '../auth.settings';

/**
 * Recuperación de contraseña por correo.
 *
 * - request(): SIEMPRE termina igual, exista o no el correo (no revela cuentas).
 *   Máximo N enlaces por hora y usuario; los extra se descartan en silencio.
 * - reset(): el enlace sirve una vez, vence en minutos y se guarda solo como hash.
 *   Al usarlo se cierran TODAS las sesiones y se desbloquea la cuenta.
 */
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: SecretTokens,
    private readonly emails: AccountEmails,
    private readonly settings: AuthSettings,
    private readonly audit: AuditLog,
  ) {}

  async request(email: string, requestedIp?: string): Promise<void> {
    const user = await this.repository.findUserByEmail(
      email.trim().toLowerCase(),
    );
    if (!user || user.status !== 'ACTIVE') return;
    await this.issue(user, requestedIp);
  }

  /** Un admin pide el enlace para un miembro de su empresa (no puede fijarle la contraseña). */
  async requestForUser(
    userId: string,
    actor: { companyId: string; userId: string },
  ) {
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== 'ACTIVE') return;
    const sent = await this.issue(user);
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'user.password_reset_requested',
      entityType: 'User',
      entityId: userId,
      after: { emailSent: sent },
    });
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const record = await this.repository.findResetToken(
      this.tokens.hash(token),
    );
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new InvalidResetTokenError();
    }
    // Consumir primero: si dos peticiones usan el mismo enlace a la vez, solo una gana
    if (!(await this.repository.consumeResetToken(record.id))) {
      throw new InvalidResetTokenError();
    }
    const user = await this.repository.findUserById(record.userId);
    if (!user) throw new InvalidResetTokenError();

    await this.repository.updatePassword(
      user.id,
      await this.passwords.hash(newPassword),
    );
    await this.repository.revokeAllUserSessions(user.id);
    this.emails.passwordChanged(user);
    await this.audit.record({
      companyId: null,
      actorUserId: user.id,
      action: 'user.password_reset',
      entityType: 'User',
      entityId: user.id,
    });
  }

  /**
   * Invitación de una cuenta recién creada: mismo mecanismo que la recuperación,
   * pero con vigencia larga y sin el límite por hora (lo dispara el superadmin).
   */
  async invite(
    userId: string,
    companyName: string,
    roleName?: string,
  ): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (!user) return;
    const token = await this.createToken(
      user.id,
      this.settings.security.inviteTokenTtlHours * 60,
    );
    this.emails.invitation(user, token, companyName, roleName);
  }

  private async issue(user: AuthUser, requestedIp?: string): Promise<boolean> {
    const since = new Date(Date.now() - 3_600_000);
    const recent = await this.repository.countResetTokensSince(user.id, since);
    if (recent >= this.settings.security.maxResetRequestsPerHour) return false;

    const token = await this.createToken(
      user.id,
      this.settings.security.resetTokenTtlMinutes,
      requestedIp,
    );
    this.emails.passwordReset(user, token);
    return true;
  }

  private async createToken(
    userId: string,
    ttlMinutes: number,
    requestedIp?: string,
  ) {
    const { token, hash } = this.tokens.generate();
    await this.repository.createResetToken({
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      requestedIp,
    });
    return token;
  }
}
