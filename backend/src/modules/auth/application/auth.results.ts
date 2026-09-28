export interface AuthTokens {
  accessToken: string;
  /** Segundos hasta que expira el access token. */
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
}

export interface ActiveCompany {
  id: string;
  name: string;
  slug: string;
  role: { code: string; name: string };
}

export interface ClientContext {
  userAgent?: string;
  ipAddress?: string;
}
