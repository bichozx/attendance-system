import {
  AccountLockedError,
  CompanySelectionRequiredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  NoActiveCompanyError,
  RefreshTokenReusedError,
} from '../../domain/auth.errors';
import type {
  ActiveMembership,
  AuthUser,
  NewSession,
  SessionRecord,
} from '../../domain/auth.types';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { AccessTokenService } from '../../domain/ports/access-token.service';
import {
  lockAfterFailure,
  SecurityPolicy,
} from '../../domain/account-security';
import { AuthRepository } from '../../domain/ports/auth.repository';
import { AccountEmails } from '../account-emails';
import { PasswordHasher } from '../../domain/ports/password-hasher';
import { CryptoRefreshTokenCodec } from '../../infrastructure/crypto-refresh-token.codec';
import { AuthSettings } from '../auth.settings';
import { SessionIssuer } from '../session-issuer';
import { LoginUseCase } from './login.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';

// ---------- Dobles de prueba en memoria ----------

class InMemoryAuthRepository extends AuthRepository {
  users: AuthUser[] = [];
  memberships = new Map<string, ActiveMembership[]>();
  sessions = new Map<string, SessionRecord>();

  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findActiveMemberships(userId: string) {
    return this.memberships.get(userId) ?? [];
  }
  async recordLogin() {}
  async createSession(s: NewSession) {
    this.sessions.set(s.id, { ...s, revokedAt: null });
  }
  async findSessionById(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async rotateSession(
    id: string,
    currentHash: string,
    newHash: string,
    expiresAt: Date,
  ) {
    const s = this.sessions.get(id);
    if (!s || s.revokedAt || s.refreshTokenHash !== currentHash) return false;
    s.refreshTokenHash = newHash;
    s.expiresAt = expiresAt;
    return true;
  }
  async revokeSession(id: string) {
    const s = this.sessions.get(id);
    if (s) s.revokedAt = new Date();
  }
  async revokeAllUserSessions(userId: string) {
    for (const s of this.sessions.values())
      if (s.userId === userId) s.revokedAt = new Date();
  }
  async registerFailedLogin(userId: string, policy: SecurityPolicy, now: Date) {
    const u = this.users.find((x) => x.id === userId)!;
    u.failedLoginAttempts++;
    const lockedUntil = lockAfterFailure(u.failedLoginAttempts, policy, now);
    if (lockedUntil) Object.assign(u, { lockedUntil, failedLoginAttempts: 0 });
    return { attempts: u.failedLoginAttempts, lockedUntil };
  }
  async clearLoginFailures(userId: string) {
    Object.assign(
      this.users.find((x) => x.id === userId)!,
      {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    );
  }
  async updatePassword() {}
  async revokeOtherSessions() {
    return 0;
  }
  async listActiveSessions() {
    return [];
  }
  async revokeUserSession() {
    return false;
  }
  async countResetTokensSince() {
    return 0;
  }
  async createResetToken() {}
  async findResetToken() {
    return null;
  }
  async consumeResetToken() {
    return false;
  }
}

class FakePasswordHasher extends PasswordHasher {
  async hash(plain: string) {
    return `hashed:${plain}`;
  }
  async verify(hash: string | null, plain: string) {
    return hash === `hashed:${plain}`;
  }
}

class FakeAccessTokenService extends AccessTokenService {
  async sign(claims: AuthenticatedUser) {
    return { token: `access:${JSON.stringify(claims)}`, expiresIn: 900 };
  }
  async verify() {
    return null;
  }
}

// ---------- Fixtures ----------

const user: AuthUser = {
  id: 'user-1',
  email: 'ana@demo.local',
  passwordHash: 'hashed:Secreta123',
  firstName: 'Ana',
  lastName: 'Admin',
  status: 'ACTIVE',
  isPlatformAdmin: false,
  mustChangePassword: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
};

const membership = (companyId: string, name: string): ActiveMembership => ({
  companyId,
  companyName: name,
  companySlug: name.toLowerCase(),
  roleCode: 'COMPANY_ADMIN',
  roleName: 'Administrador',
  permissions: ['employees.read', 'shifts.manage'],
});

function setup() {
  const repository = new InMemoryAuthRepository();
  const codec = new CryptoRefreshTokenCodec();
  const settings = new AuthSettings(900, 30);
  const issuer = new SessionIssuer(
    repository,
    new FakeAccessTokenService(),
    codec,
    settings,
  );
  const emails = {
    accountLocked: jest.fn(),
    passwordChanged: jest.fn(),
    passwordReset: jest.fn(),
  };
  const login = new LoginUseCase(
    repository,
    new FakePasswordHasher(),
    issuer,
    settings,
    emails as unknown as AccountEmails,
  );
  const refresh = new RefreshSessionUseCase(
    repository,
    codec,
    issuer,
    settings,
  );
  repository.users.push({ ...user });
  return { repository, login, refresh, emails };
}

const client = { userAgent: 'jest', ipAddress: '127.0.0.1' };

// ---------- Login ----------

describe('LoginUseCase', () => {
  it('inicia sesión con la única empresa del usuario e incluye sus permisos', async () => {
    const { repository, login } = setup();
    repository.memberships.set(user.id, [membership('c-1', 'Demo')]);

    const result = await login.execute({
      email: ' ANA@demo.local ',
      password: 'Secreta123',
      client,
    });

    expect(result.company?.id).toBe('c-1');
    expect(result.accessToken).toContain('"companyId":"c-1"');
    expect(result.accessToken).toContain('shifts.manage');
    expect(repository.sessions.size).toBe(1);
  });

  it('rechaza contraseña incorrecta y correo inexistente con el mismo error', async () => {
    const { login } = setup();
    await expect(
      login.execute({ email: user.email, password: 'mala', client }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      login.execute({
        email: 'nadie@demo.local',
        password: 'Secreta123',
        client,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('pide elegir empresa cuando el usuario pertenece a varias', async () => {
    const { repository, login } = setup();
    repository.memberships.set(user.id, [
      membership('c-1', 'Demo'),
      membership('c-2', 'Otra'),
    ]);

    const attempt = login.execute({
      email: user.email,
      password: 'Secreta123',
      client,
    });
    await expect(attempt).rejects.toBeInstanceOf(CompanySelectionRequiredError);

    const result = await login.execute({
      email: user.email,
      password: 'Secreta123',
      companyId: 'c-2',
      client,
    });
    expect(result.company?.name).toBe('Otra');
  });

  it('bloquea la cuenta al 5.º intento fallido y avisa por correo', async () => {
    const { login, emails } = setup();
    for (let i = 0; i < 4; i++) {
      await expect(
        login.execute({ email: user.email, password: 'mala', client }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    await expect(
      login.execute({ email: user.email, password: 'mala', client }),
    ).rejects.toBeInstanceOf(AccountLockedError);
    // Bloqueada: ni con la contraseña correcta
    await expect(
      login.execute({ email: user.email, password: 'Secreta123', client }),
    ).rejects.toBeInstanceOf(AccountLockedError);
    expect(emails.accountLocked).toHaveBeenCalledTimes(1);
  });

  it('rechaza a un usuario sin empresas activas', async () => {
    const { login } = setup();
    await expect(
      login.execute({ email: user.email, password: 'Secreta123', client }),
    ).rejects.toBeInstanceOf(NoActiveCompanyError);
  });
});

// ---------- Refresh ----------

describe('RefreshSessionUseCase', () => {
  async function loggedIn() {
    const ctx = setup();
    ctx.repository.memberships.set(user.id, [membership('c-1', 'Demo')]);
    const tokens = await ctx.login.execute({
      email: user.email,
      password: 'Secreta123',
      client,
    });
    return { ...ctx, tokens };
  }

  it('rota el refresh token: entrega uno nuevo y distinto', async () => {
    const { refresh, tokens } = await loggedIn();
    const next = await refresh.execute(tokens.refreshToken);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
    await expect(refresh.execute(next.refreshToken)).resolves.toBeDefined();
  });

  it('detecta el reuso de un token ya rotado y revoca la sesión completa', async () => {
    const { refresh, tokens, repository } = await loggedIn();
    const next = await refresh.execute(tokens.refreshToken);

    // Un atacante usa el token viejo
    await expect(refresh.execute(tokens.refreshToken)).rejects.toBeInstanceOf(
      RefreshTokenReusedError,
    );
    // El token legítimo más reciente también queda inservible
    await expect(refresh.execute(next.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect([...repository.sessions.values()][0].revokedAt).not.toBeNull();
  });

  it('corta la sesión si el usuario fue desactivado', async () => {
    const { refresh, tokens, repository } = await loggedIn();
    repository.users[0].status = 'LOCKED';
    await expect(refresh.execute(tokens.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('corta la sesión si el usuario perdió acceso a la empresa', async () => {
    const { refresh, tokens, repository } = await loggedIn();
    repository.memberships.set(user.id, []);
    await expect(refresh.execute(tokens.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rechaza tokens con formato inválido', async () => {
    const { refresh } = await loggedIn();
    await expect(refresh.execute('basura')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});
