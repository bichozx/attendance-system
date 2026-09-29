import type { Page } from '../../../shared/application/page';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../../shared/domain/date-only';
import type {
  EmployeeChanges,
  EmployeeData,
  EmployeeView,
} from '../domain/employee.types';
import type {
  CreateEmployeeDto,
  EmployeeResponseDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';

/** Traduce entre el formato HTTP (fechas "YYYY-MM-DD") y el dominio (Date). */
export const EmployeePresenter = {
  toResponse(e: EmployeeView): EmployeeResponseDto {
    return {
      ...e,
      birthDate: e.birthDate ? formatDateOnly(e.birthDate) : null,
      hireDate: formatDateOnly(e.hireDate),
      terminationDate: e.terminationDate
        ? formatDateOnly(e.terminationDate)
        : null,
      hasAppAccess: e.userId !== null,
    };
  },

  toPage(page: Page<EmployeeView>): Page<EmployeeResponseDto> {
    return { ...page, items: page.items.map(EmployeePresenter.toResponse) };
  },

  toData(dto: CreateEmployeeDto): EmployeeData {
    return {
      code: dto.code,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email?.toLowerCase() ?? null,
      phone: dto.phone ?? null,
      birthDate: dto.birthDate ? parseDateOnly(dto.birthDate) : null,
      hireDate: parseDateOnly(dto.hireDate),
      positionId: dto.positionId ?? null,
      defaultStoreId: dto.defaultStoreId ?? null,
    };
  },

  /** Conserva la diferencia entre undefined (no tocar) y null (borrar). */
  toChanges(dto: UpdateEmployeeDto): EmployeeChanges {
    const date = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null ? null : parseDateOnly(v);
    return {
      code: dto.code,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email:
        dto.email === undefined
          ? undefined
          : (dto.email?.toLowerCase() ?? null),
      phone: dto.phone,
      birthDate: date(dto.birthDate),
      hireDate: dto.hireDate ? parseDateOnly(dto.hireDate) : undefined,
      positionId: dto.positionId,
      defaultStoreId: dto.defaultStoreId,
    };
  },
};
