import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { CompanyNotFoundError } from '../domain/company.errors';
import { CompanyRepository } from '../domain/company.repository';
import { assertCompanySettings } from '../domain/company.rules';
import type {
  CompanySettingsChanges,
  CompanyView,
} from '../domain/company.types';

/** Configuración de la empresa por su propio administrador. */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly audit: AuditLog,
  ) {}

  async get(companyId: string): Promise<CompanyView> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new CompanyNotFoundError();
    return company;
  }

  /**
   * Los turnos ya creados no cambian: guardan sus propios minutos y sus horas en UTC.
   * Cambiar la zona horaria solo afecta cómo se MUESTRAN las horas en adelante.
   */
  async update(
    actor: Actor,
    changes: CompanySettingsChanges,
  ): Promise<CompanyView> {
    assertCompanySettings(changes);
    const before = await this.get(actor.companyId);
    const after = await this.companies.update(actor.companyId, {
      name: changes.name,
      legalName: changes.legalName,
      timezone: changes.timezone,
      shiftDefaults: changes.shiftDefaults,
    });
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'company.settings_updated',
      entityType: 'Company',
      entityId: actor.companyId,
      before,
      after,
    });
    return after;
  }
}
