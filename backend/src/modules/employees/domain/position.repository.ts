import type { PositionView } from './employee.types';

export abstract class PositionRepository {
  abstract list(
    companyId: string,
    includeInactive: boolean,
  ): Promise<PositionView[]>;
  abstract findById(
    companyId: string,
    id: string,
  ): Promise<PositionView | null>;
  abstract findIdByName(
    companyId: string,
    name: string,
  ): Promise<string | null>;
  abstract create(
    companyId: string,
    data: { name: string; description: string | null },
  ): Promise<PositionView>;
  abstract update(
    companyId: string,
    id: string,
    changes: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<PositionView>;
}
