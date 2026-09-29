import type { PageRequest } from '../../../shared/application/page';
import type {
  DocumentType,
  EmployeeChanges,
  EmployeeData,
  EmployeeFilter,
  EmployeeView,
  StatusChange,
} from './employee.types';

/** Todas las operaciones reciben companyId: no existe forma de leer otra empresa. */
export abstract class EmployeeRepository {
  abstract list(
    companyId: string,
    filter: EmployeeFilter,
    page: PageRequest,
  ): Promise<{ items: EmployeeView[]; total: number }>;

  abstract findById(
    companyId: string,
    id: string,
  ): Promise<EmployeeView | null>;

  abstract findIdByCode(
    companyId: string,
    code: string,
  ): Promise<string | null>;
  abstract findIdByDocument(
    companyId: string,
    type: DocumentType,
    number: string,
  ): Promise<string | null>;
  abstract findIdByUserId(
    companyId: string,
    userId: string,
  ): Promise<string | null>;

  abstract positionExists(companyId: string, id: string): Promise<boolean>;
  abstract storeExists(companyId: string, id: string): Promise<boolean>;

  abstract create(companyId: string, data: EmployeeData): Promise<EmployeeView>;
  abstract update(
    companyId: string,
    id: string,
    changes: EmployeeChanges,
  ): Promise<EmployeeView>;

  /**
   * Cambia el estado. Si el nuevo estado bloquea el acceso y hay cuenta vinculada,
   * desactiva la membresía y cierra sus sesiones en la misma transacción.
   * Si vuelve a ACTIVE, reactiva la membresía.
   */
  abstract changeStatus(
    companyId: string,
    id: string,
    change: StatusChange,
  ): Promise<EmployeeView>;

  abstract linkUser(
    companyId: string,
    id: string,
    userId: string,
  ): Promise<void>;
}
