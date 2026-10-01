import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../../shared/application/audit-log';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import {
  InvalidCredentialsError,
  InvalidCurrentPasswordError,
  PasswordUnchangedError,
} from '../../domain/auth.errors';
import { AuthRepository } from '../../domain/ports/auth.repository';
import { PasswordHasher } from '../../domain/ports/password-hasher';
import { AccountEmails } from '../account-emails';
import { SessionIssuer } from '../session-issuer';

/**
 * Cambio de contraseña del propio usuario.
 * - Exige la contraseña actual (un token robado no basta para apoderarse de la cuenta).
 * - Cierra las DEMÁS sesiones y conserva la actual.
 * - Devuelve un access token nuevo, ya sin la marca de contraseña temporal.
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly emails: AccountEmails,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    auth: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.repository.findUserById(auth.userId);
    if (!user) throw new InvalidCredentialsError();

    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new InvalidCurrentPasswordError();
    }
    if (await this.passwords.verify(user.passwordHash, newPassword)) {
      throw new PasswordUnchangedError();
    }

    await this.repository.updatePassword(
      user.id,
      await this.passwords.hash(newPassword),
    );
    const closedSessions = await this.repository.revokeOtherSessions(
      user.id,
      auth.sessionId,
    );

    const membership = auth.companyId
      ? ((await this.repository.findActiveMemberships(user.id)).find(
          (m) => m.companyId === auth.companyId,
        ) ?? null)
      : null;
    const access = await this.sessions.signAccessToken(
      { ...user, mustChangePassword: false },
      membership,
      auth.sessionId,
    );

    this.emails.passwordChanged(user);
    await this.audit.record({
      companyId: auth.companyId,
      actorUserId: user.id,
      action: 'user.password_changed',
      entityType: 'User',
      entityId: user.id,
      after: { wasTemporary: user.mustChangePassword, closedSessions },
    });
    return {
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresIn,
      closedSessions,
    };
  }
}
