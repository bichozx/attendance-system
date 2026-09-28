import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';

export interface SignedAccessToken {
  token: string;
  expiresIn: number; // segundos
}

export abstract class AccessTokenService {
  abstract sign(claims: AuthenticatedUser): Promise<SignedAccessToken>;
  /** Devuelve null si el token es inválido o expiró. */
  abstract verify(token: string): Promise<AuthenticatedUser | null>;
}
