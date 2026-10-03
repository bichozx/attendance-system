import type { ContractType } from './contract.rules';

export interface ContractView {
  id: string;
  employeeId: string;
  contractType: ContractType;
  startDate: string;
  endDate: string | null;
  /** Texto decimal ("2500000.00") para no perder precisión. */
  baseSalary: string;
  currency: string;
  weeklyHours: string;
  notes: string | null;
  createdAt: Date;
}

export interface NewContract {
  contractType: ContractType;
  startDate: string;
  endDate: string | null;
  baseSalary: string;
  weeklyHours: string;
  notes: string | null;
}

export abstract class ContractRepository {
  abstract list(companyId: string, employeeId: string): Promise<ContractView[]>;
  abstract findById(
    companyId: string,
    employeeId: string,
    id: string,
  ): Promise<ContractView | null>;
  /** Crea el contrato y, si corresponde, cierra el vigente, en una transacción. */
  abstract create(
    companyId: string,
    employeeId: string,
    data: NewContract,
    close: { id: string; endDate: string } | null,
  ): Promise<ContractView>;
  abstract update(
    companyId: string,
    id: string,
    changes: { notes?: string | null; endDate?: string | null },
  ): Promise<ContractView>;
}
