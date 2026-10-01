import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { SessionNotFoundError } from '../../domain/auth.errors';
import { AuthRepository } from '../../domain/ports/auth.repository';

/** "Dispositivos con sesión abierta": el usuario ve y cierra sus sesiones. */
@Injectable()
export class SessionsService {
  constructor(private readonly repository: AuthRepository) {}

  async list(auth: AuthenticatedUser) {
    const sessions = await this.repository.listActiveSessions(auth.userId);
    return sessions.map((s) => ({ ...s, current: s.id === auth.sessionId }));
  }

  async revoke(auth: AuthenticatedUser, sessionId: string): Promise<void> {
    if (!(await this.repository.revokeUserSession(auth.userId, sessionId))) {
      throw new SessionNotFoundError();
    }
  }
}
