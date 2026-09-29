import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import {
  PositionNameTakenError,
  PositionNotFoundError,
} from '../domain/employee.errors';
import { PositionRepository } from '../domain/position.repository';

@Injectable()
export class PositionsService {
  constructor(
    private readonly positions: PositionRepository,
    private readonly audit: AuditLog,
  ) {}

  list(companyId: string, includeInactive: boolean) {
    return this.positions.list(companyId, includeInactive);
  }

  async create(
    actor: Actor,
    data: { name: string; description: string | null },
  ) {
    await this.assertNameFree(actor.companyId, data.name);
    const position = await this.positions.create(actor.companyId, data);
    await this.record(
      actor,
      position.id,
      'position.created',
      undefined,
      position,
    );
    return position;
  }

  async update(
    actor: Actor,
    id: string,
    changes: { name?: string; description?: string | null; isActive?: boolean },
  ) {
    const before = await this.positions.findById(actor.companyId, id);
    if (!before) throw new PositionNotFoundError();
    if (changes.name)
      await this.assertNameFree(actor.companyId, changes.name, id);

    const after = await this.positions.update(actor.companyId, id, changes);
    await this.record(actor, id, 'position.updated', before, after);
    return after;
  }

  private async assertNameFree(
    companyId: string,
    name: string,
    excludeId?: string,
  ) {
    const owner = await this.positions.findIdByName(companyId, name);
    if (owner && owner !== excludeId) throw new PositionNameTakenError(name);
  }

  private record(
    actor: Actor,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'Position',
      entityId: id,
      before,
      after,
    });
  }
}
