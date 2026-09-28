import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { AuthRepository } from '../../domain/ports/auth.repository';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly repository: AuthRepository) {}

  /** Cierra la sesión actual. Con `allDevices`, cierra todas las sesiones del usuario. */
  async execute(user: AuthenticatedUser, allDevices = false): Promise<void> {
    if (allDevices) {
      await this.repository.revokeAllUserSessions(user.userId);
    } else {
      await this.repository.revokeSession(user.sessionId);
    }
  }
}
