/** Configuración de Auth ya parseada. Se construye desde variables de entorno en AuthModule. */
export class AuthSettings {
  constructor(
    readonly accessTokenTtlSeconds: number,
    readonly refreshTokenTtlDays: number,
  ) {}

  refreshTokenExpiresAt(from = new Date()): Date {
    return new Date(from.getTime() + this.refreshTokenTtlDays * 86_400_000);
  }
}
