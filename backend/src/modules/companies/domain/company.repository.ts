import type { PageRequest } from '../../../shared/application/page';
import type {
  CompanyFilter,
  CompanyLegalChanges,
  CompanyStatus,
  CompanyView,
  NewCompany,
  PlatformCompanyDetail,
  PlatformCompanyView,
} from './company.types';

export abstract class CompanyRepository {
  abstract findById(id: string): Promise<CompanyView | null>;
  abstract list(
    filter: CompanyFilter,
    page: PageRequest,
  ): Promise<{ items: PlatformCompanyView[]; total: number }>;
  abstract findDetail(id: string): Promise<PlatformCompanyDetail | null>;

  abstract slugExists(slug: string, excludeId?: string): Promise<boolean>;
  abstract taxIdExists(
    country: string,
    taxId: string,
    excludeId?: string,
  ): Promise<boolean>;

  abstract findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string; firstName: string } | null>;

  /**
   * Crea la empresa y la membresía de su primer administrador en UNA transacción.
   * Si `newUser` viene, también crea la cuenta (con una contraseña que nadie conoce).
   */
  abstract createWithAdmin(
    data: NewCompany,
    admin: {
      existingUserId?: string;
      newUser?: {
        email: string;
        firstName: string;
        lastName: string;
        passwordHash: string;
      };
    },
  ): Promise<{ company: CompanyView; adminUserId: string }>;

  abstract update(
    id: string,
    changes: CompanyLegalChanges,
  ): Promise<CompanyView>;
  abstract setStatus(id: string, status: CompanyStatus): Promise<CompanyView>;
  /** Cierra todas las sesiones abiertas en esta empresa. */
  abstract revokeCompanySessions(id: string): Promise<number>;
}
