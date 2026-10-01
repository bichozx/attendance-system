export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

/** Valores que reciben los turnos nuevos si el admin no indica otros. */
export interface ShiftDefaults {
  earlyClockInMinutes: number;
  lateToleranceMinutes: number;
  breakMinutes: number;
}

export interface CompanyView {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  slug: string;
  country: string;
  timezone: string;
  currency: string;
  status: CompanyStatus;
  shiftDefaults: ShiftDefaults;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyStats {
  activeEmployees: number;
  activeUsers: number;
  stores: number;
}

export interface CompanyAdmin {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** false = aún no creó su contraseña con el enlace de bienvenida. */
  hasLoggedIn: boolean;
}

export interface PlatformCompanyView extends CompanyView {
  stats: CompanyStats;
}

export interface PlatformCompanyDetail extends PlatformCompanyView {
  admins: CompanyAdmin[];
}

export interface CompanyFilter {
  search?: string;
  status?: CompanyStatus;
}

export interface NewCompany {
  name: string;
  legalName: string | null;
  taxId: string | null;
  slug: string;
  country: string;
  timezone: string;
  currency: string;
  status: CompanyStatus;
}

/** Lo que puede cambiar el admin de la empresa. */
export interface CompanySettingsChanges {
  name?: string;
  legalName?: string | null;
  timezone?: string;
  shiftDefaults?: Partial<ShiftDefaults>;
}

/** Lo que además puede cambiar el superadmin (datos legales y de facturación). */
export interface CompanyLegalChanges extends CompanySettingsChanges {
  taxId?: string | null;
  country?: string;
  currency?: string;
  slug?: string;
}

export interface FirstAdminInput {
  email: string;
  firstName: string;
  lastName: string;
}
