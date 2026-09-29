import type { PageRequest } from '../../../shared/application/page';
import type {
  CompanyUserFilter,
  CompanyUserView,
  MembershipStatus,
  NewAccount,
} from './company-user.types';

export abstract class CompanyUserRepository {
  abstract list(
    companyId: string,
    filter: CompanyUserFilter,
    page: PageRequest,
  ): Promise<{ items: CompanyUserView[]; total: number }>;

  abstract findById(
    companyId: string,
    userId: string,
  ): Promise<CompanyUserView | null>;

  /** Búsqueda global por correo (las cuentas son compartidas entre empresas). */
  abstract findUserIdByEmail(email: string): Promise<string | null>;

  /** Crea la cuenta y su membresía en una sola transacción. Devuelve el userId. */
  abstract createAccountWithMembership(
    companyId: string,
    account: NewAccount,
    roleId: string,
  ): Promise<string>;

  abstract addMembership(
    companyId: string,
    userId: string,
    roleId: string,
  ): Promise<void>;

  abstract updateMembership(
    companyId: string,
    userId: string,
    changes: { roleId?: string; status?: MembershipStatus },
  ): Promise<void>;

  /** Cierra las sesiones del usuario en esta empresa (no en las demás). */
  abstract revokeCompanySessions(
    companyId: string,
    userId: string,
  ): Promise<void>;
}
