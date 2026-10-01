/** Genera secretos de un solo uso (enlaces de recuperación) y su hash para guardarlos. */
export abstract class SecretTokens {
  abstract generate(): { token: string; hash: string };
  abstract hash(token: string): string;
}
