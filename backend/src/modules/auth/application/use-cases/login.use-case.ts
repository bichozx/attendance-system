import { Injectable } from '@nestjs/common';
import {
  AccountLockedError,
  CompanyAccessDeniedError,
  CompanySelectionRequiredError,
  InvalidCredentialsError,
  NoActiveCompanyError,
  UserNotActiveError,
} from '../../domain/auth.errors';
import type { ActiveMembership } from '../../domain/auth.types';
import { AuthRepository } from '../../domain/ports/auth.repository';
import { PasswordHasher } from '../../domain/ports/password-hasher';
import { isLocked, secondsUntil } from '../../domain/account-security';
import { AccountEmails } from '../account-emails';
import { AuthSettings } from '../auth.settings';
import type {
  ActiveCompany,
  AuthTokens,
  ClientContext,
  UserProfile,
} from '../auth.results';
import { SessionIssuer } from '../session-issuer';

export interface LoginCommand {
  email: string;
  password: string;
  /** Obligatorio solo si el usuario pertenece a varias empresas. */
  companyId?: string;
  client: ClientContext;
}

export interface LoginResult extends AuthTokens {
  user: UserProfile;
  company: ActiveCompany | null;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly settings: AuthSettings,
    private readonly emails: AccountEmails,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const email = command.email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(email);
    const now = new Date();

    // Cuenta bloqueada: ni siquiera se verifica la contraseña
    if (user && isLocked(user.lockedUntil, now)) {
      throw new AccountLockedError(secondsUntil(user.lockedUntil!, now));
    }

    // Siempre se verifica (aunque el usuario no exista) para no filtrar por tiempo qué correos existen.
    const passwordOk = await this.passwords.verify(
      user?.passwordHash ?? null,
      command.password,
    );
    if (!user || !passwordOk) {
      if (user) {
        const { lockedUntil } = await this.repository.registerFailedLogin(
          user.id,
          this.settings.security,
          now,
        );
        if (lockedUntil) {
          this.emails.accountLocked(user);
          throw new AccountLockedError(secondsUntil(lockedUntil, now));
        }
      }
      throw new InvalidCredentialsError();
    }
    if (user.status !== 'ACTIVE') throw new UserNotActiveError();
    if (user.failedLoginAttempts > 0)
      await this.repository.clearLoginFailures(user.id);

    const memberships = await this.repository.findActiveMemberships(user.id);
    const membership = this.selectMembership(
      memberships,
      command.companyId,
      user.isPlatformAdmin,
    );

    const tokens = await this.sessions.startSession(
      user,
      membership,
      command.client,
    );
    await this.repository.recordLogin(user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isPlatformAdmin: user.isPlatformAdmin,
        mustChangePassword: user.mustChangePassword,
      },
      company: membership
        ? {
            id: membership.companyId,
            name: membership.companyName,
            slug: membership.companySlug,
            role: { code: membership.roleCode, name: membership.roleName },
          }
        : null,
    };
  }

  private selectMembership(
    memberships: ActiveMembership[],
    companyId: string | undefined,
    isPlatformAdmin: boolean,
  ): ActiveMembership | null {
    if (companyId) {
      const selected = memberships.find((m) => m.companyId === companyId);
      if (!selected) throw new CompanyAccessDeniedError();
      return selected;
    }

    if (memberships.length === 1) return memberships[0];

    if (memberships.length > 1) {
      throw new CompanySelectionRequiredError(
        memberships.map((m) => ({
          id: m.companyId,
          name: m.companyName,
          slug: m.companySlug,
        })),
      );
    }

    // Sin empresas: solo el superadmin de la plataforma puede entrar.
    if (isPlatformAdmin) return null;
    throw new NoActiveCompanyError();
  }
}
