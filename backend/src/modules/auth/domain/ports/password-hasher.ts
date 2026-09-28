export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;

  /**
   * Verifica la contraseña. Si `passwordHash` es null (usuario inexistente),
   * igual consume el mismo tiempo y devuelve false, para no revelar qué correos existen.
   */
  abstract verify(passwordHash: string | null, plain: string): Promise<boolean>;
}
