import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditLog } from '../../../shared/application/audit-log';
import { PageRequest, toPage } from '../../../shared/application/page';
import { AccountEmails } from '../../auth/application/account-emails';
import { PasswordRecoveryService } from '../../auth/application/use-cases/password-recovery.service';
import { PasswordHasher } from '../../auth/domain/ports/password-hasher';
import {
  CompanyAdminNotFoundError,
  CompanyNotFoundError,
  CompanySlugTakenError,
  CompanyTaxIdTakenError,
} from '../domain/company.errors';
import { CompanyRepository } from '../domain/company.repository';
import {
  assertCompanySettings,
  blocksAccess,
  slugify,
} from '../domain/company.rules';
import type {
  CompanyFilter,
  CompanyLegalChanges,
  CompanyStatus,
  FirstAdminInput,
  PlatformCompanyDetail,
} from '../domain/company.types';

export interface CreateCompanyInput {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  slug?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  status?: 'TRIAL' | 'ACTIVE';
  admin: FirstAdminInput;
}

/** Operaciones del superadministrador sobre las empresas (tenants). */
@Injectable()
export class PlatformCompaniesService {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly passwords: PasswordHasher,
    private readonly recovery: PasswordRecoveryService,
    private readonly emails: AccountEmails,
    private readonly audit: AuditLog,
  ) {}

  async list(filter: CompanyFilter, page: PageRequest) {
    const { items, total } = await this.companies.list(filter, page);
    return toPage(items, total, page);
  }

  async get(id: string): Promise<PlatformCompanyDetail> {
    const company = await this.companies.findDetail(id);
    if (!company) throw new CompanyNotFoundError();
    return company;
  }

  /**
   * Alta de una empresa con su primer administrador.
   * El superadmin NUNCA conoce la contraseña del admin:
   * - cuenta nueva → contraseña aleatoria que nadie sabe + correo de bienvenida para crearla;
   * - cuenta existente → solo se le agrega la empresa y se le avisa.
   */
  async create(
    actorUserId: string,
    input: CreateCompanyInput,
  ): Promise<PlatformCompanyDetail> {
    const data = {
      name: input.name.trim(),
      legalName: input.legalName?.trim() || null,
      taxId: input.taxId?.trim() || null,
      country: input.country ?? 'CO',
      timezone: input.timezone ?? 'America/Bogota',
      currency: input.currency ?? 'COP',
      status: input.status ?? ('TRIAL' as const),
      slug: input.slug ?? (await this.freeSlug(input.name)),
    };
    assertCompanySettings(data);
    if (input.slug && (await this.companies.slugExists(input.slug))) {
      throw new CompanySlugTakenError(input.slug);
    }
    if (
      data.taxId &&
      (await this.companies.taxIdExists(data.country, data.taxId))
    ) {
      throw new CompanyTaxIdTakenError();
    }

    const email = input.admin.email.trim().toLowerCase();
    const existing = await this.companies.findUserByEmail(email);
    const { company, adminUserId } = await this.companies.createWithAdmin(
      data,
      existing
        ? { existingUserId: existing.id }
        : {
            newUser: {
              email,
              firstName: input.admin.firstName.trim(),
              lastName: input.admin.lastName.trim(),
              // Contraseña imposible de adivinar que nadie conoce: se reemplaza con el enlace
              passwordHash: await this.passwords.hash(
                randomBytes(32).toString('base64url'),
              ),
            },
          },
    );

    if (existing) {
      this.emails.addedToCompany(existing, company.name, 'Administrador');
    } else {
      await this.recovery.invite(adminUserId, company.name);
    }

    await this.audit.record({
      companyId: company.id,
      actorUserId,
      action: 'company.created',
      entityType: 'Company',
      entityId: company.id,
      after: { ...company, adminUserId, adminExistingAccount: !!existing },
    });
    return this.get(company.id);
  }

  async update(actorUserId: string, id: string, changes: CompanyLegalChanges) {
    assertCompanySettings(changes);
    const before = await this.get(id);
    const country = changes.country ?? before.country;
    const taxId = changes.taxId === undefined ? before.taxId : changes.taxId;
    if (taxId && (await this.companies.taxIdExists(country, taxId, id))) {
      throw new CompanyTaxIdTakenError();
    }
    if (changes.slug && (await this.companies.slugExists(changes.slug, id))) {
      throw new CompanySlugTakenError(changes.slug);
    }
    const after = await this.companies.update(id, changes);
    await this.record(actorUserId, id, 'company.updated', before, after);
    return this.get(id);
  }

  /**
   * Suspender o cancelar bloquea el acceso de inmediato: se cierran las sesiones abiertas
   * en la empresa y el login deja de ofrecerla. Ningún dato se borra.
   */
  async changeStatus(
    actorUserId: string,
    id: string,
    status: CompanyStatus,
    reason: string | null,
  ) {
    const before = await this.get(id);
    if (before.status === status) return before;

    await this.companies.setStatus(id, status);
    const closedSessions = blocksAccess(status)
      ? await this.companies.revokeCompanySessions(id)
      : 0;
    await this.record(
      actorUserId,
      id,
      'company.status_changed',
      { status: before.status },
      {
        status,
        reason,
        closedSessions,
      },
    );
    return this.get(id);
  }

  /** Reenvía la invitación a un admin que aún no creó su contraseña (el enlace dura 72 h). */
  async resendInvitation(actorUserId: string, id: string, userId: string) {
    const company = await this.get(id);
    const admin = company.admins.find((a) => a.userId === userId);
    if (!admin) throw new CompanyAdminNotFoundError();
    await this.recovery.invite(userId, company.name);
    await this.record(actorUserId, id, 'company.invitation_resent', undefined, {
      userId,
    });
  }

  /** "panaderia-rosa", y si existe: "panaderia-rosa-2", "-3"... */
  private async freeSlug(name: string): Promise<string> {
    const base = slugify(name) || 'empresa';
    for (let i = 1; ; i++) {
      const candidate = i === 1 ? base : `${base.slice(0, 46)}-${i}`;
      if (!(await this.companies.slugExists(candidate))) return candidate;
    }
  }

  private record(
    actorUserId: string,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: id,
      actorUserId,
      action,
      entityType: 'Company',
      entityId: id,
      before,
      after,
    });
  }
}
