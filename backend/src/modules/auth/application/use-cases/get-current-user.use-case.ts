import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { InvalidCredentialsError } from '../../domain/auth.errors';
import { AuthRepository } from '../../domain/ports/auth.repository';
import type { ActiveCompany, UserProfile } from '../auth.results';

export interface CurrentUserResult {
  user: UserProfile;
  company: ActiveCompany | null;
  permissions: string[];
}

@Injectable()
export class GetCurrentUserUseCase {
  constructor(private readonly repository: AuthRepository) {}

  async execute(auth: AuthenticatedUser): Promise<CurrentUserResult> {
    const user = await this.repository.findUserById(auth.userId);
    if (!user) throw new InvalidCredentialsError();

    const membership = auth.companyId
      ? (await this.repository.findActiveMemberships(user.id)).find(
          (m) => m.companyId === auth.companyId,
        )
      : undefined;

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      company: membership
        ? {
            id: membership.companyId,
            name: membership.companyName,
            slug: membership.companySlug,
            role: { code: membership.roleCode, name: membership.roleName },
          }
        : null,
      permissions: auth.permissions,
    };
  }
}
