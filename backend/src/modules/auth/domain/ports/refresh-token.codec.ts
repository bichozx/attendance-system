export interface IssuedRefreshToken {
  sessionId: string;
  /** Valor que recibe el cliente. Nunca se guarda en la base de datos. */
  token: string;
  /** Hash que sí se guarda. */
  hash: string;
}

export interface ParsedRefreshToken {
  sessionId: string;
  hash: string;
}

export abstract class RefreshTokenCodec {
  /** Genera un refresh token nuevo. Sin sessionId, genera también el id de la sesión. */
  abstract issue(sessionId?: string): IssuedRefreshToken;
  /** Devuelve null si el formato es inválido. */
  abstract parse(token: string): ParsedRefreshToken | null;
}
