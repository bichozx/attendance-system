/** Usuario autenticado de la petición actual (extraído del access token). */
export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  /** Empresa activa (tenant). null solo para el superadmin sin empresa. */
  companyId: string | null;
  isPlatformAdmin: boolean;
  permissions: string[];
}
