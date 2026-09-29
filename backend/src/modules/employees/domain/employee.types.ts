export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'TERMINATED';
export type DocumentType = 'CC' | 'CE' | 'TI' | 'PPT' | 'PASSPORT' | 'OTHER';

export interface EmployeeView {
  id: string;
  code: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: Date | null;
  hireDate: Date;
  terminationDate: Date | null;
  status: EmployeeStatus;
  position: { id: string; name: string } | null;
  defaultStore: { id: string; name: string } | null;
  /** Cuenta de acceso a la app, si tiene. */
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeFilter {
  search?: string;
  status?: EmployeeStatus;
  positionId?: string;
  storeId?: string;
}

export interface EmployeeData {
  code: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: Date | null;
  hireDate: Date;
  positionId: string | null;
  defaultStoreId: string | null;
}

/** undefined = no cambiar; null = borrar (en los campos opcionales). */
export type EmployeeChanges = Partial<EmployeeData>;

export interface StatusChange {
  status: EmployeeStatus;
  hireDate: Date;
  terminationDate: Date | null;
}

export interface PositionView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}
