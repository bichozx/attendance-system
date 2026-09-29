import { parseDateOnly as d } from '../../../shared/domain/date-only';
import {
  InvalidEmployeeDatesError,
  InvalidStatusTransitionError,
} from './employee.errors';
import {
  assertEmployeeDates,
  blocksAppAccess,
  planStatusChange,
} from './employee.rules';

const active = {
  status: 'ACTIVE' as const,
  hireDate: d('2026-01-15'),
  terminationDate: null,
};
const terminated = {
  status: 'TERMINATED' as const,
  hireDate: d('2026-01-15'),
  terminationDate: d('2026-06-30'),
};

describe('assertEmployeeDates', () => {
  it('acepta fechas coherentes', () => {
    expect(() =>
      assertEmployeeDates({
        birthDate: d('1995-04-12'),
        hireDate: d('2026-01-15'),
        terminationDate: d('2026-06-30'),
      }),
    ).not.toThrow();
  });

  it('rechaza nacimiento igual o posterior al ingreso', () => {
    expect(() =>
      assertEmployeeDates({
        birthDate: d('2026-01-15'),
        hireDate: d('2026-01-15'),
        terminationDate: null,
      }),
    ).toThrow(InvalidEmployeeDatesError);
  });

  it('rechaza retiro anterior al ingreso', () => {
    expect(() =>
      assertEmployeeDates({
        birthDate: null,
        hireDate: d('2026-01-15'),
        terminationDate: d('2026-01-14'),
      }),
    ).toThrow(InvalidEmployeeDatesError);
  });
});

describe('planStatusChange', () => {
  it('no hace nada si el estado no cambia', () => {
    expect(planStatusChange(active, { status: 'ACTIVE' })).toBeNull();
  });

  it('retira con fecha y la conserva', () => {
    expect(
      planStatusChange(active, {
        status: 'TERMINATED',
        terminationDate: d('2026-10-15'),
      }),
    ).toEqual({
      status: 'TERMINATED',
      hireDate: active.hireDate,
      terminationDate: d('2026-10-15'),
    });
  });

  it('exige fecha para retirar', () => {
    expect(() => planStatusChange(active, { status: 'TERMINATED' })).toThrow(
      InvalidEmployeeDatesError,
    );
  });

  it('un retirado solo puede volver como ACTIVE', () => {
    expect(() => planStatusChange(terminated, { status: 'ON_LEAVE' })).toThrow(
      InvalidStatusTransitionError,
    );
  });

  it('el reintegro exige fecha y no puede ser anterior al retiro', () => {
    expect(() => planStatusChange(terminated, { status: 'ACTIVE' })).toThrow(
      InvalidEmployeeDatesError,
    );
    expect(() =>
      planStatusChange(terminated, {
        status: 'ACTIVE',
        rehireDate: d('2026-06-01'),
      }),
    ).toThrow(InvalidEmployeeDatesError);
  });

  it('el reintegro reemplaza la fecha de ingreso y limpia la de retiro', () => {
    expect(
      planStatusChange(terminated, {
        status: 'ACTIVE',
        rehireDate: d('2026-11-01'),
      }),
    ).toEqual({
      status: 'ACTIVE',
      hireDate: d('2026-11-01'),
      terminationDate: null,
    });
  });

  it('pasar a licencia conserva la fecha de ingreso', () => {
    expect(planStatusChange(active, { status: 'ON_LEAVE' })?.hireDate).toEqual(
      active.hireDate,
    );
  });
});

describe('blocksAppAccess', () => {
  it.each([
    ['ACTIVE', false],
    ['ON_LEAVE', false],
    ['INACTIVE', true],
    ['TERMINATED', true],
  ] as const)('%s → %s', (status, expected) => {
    expect(blocksAppAccess(status)).toBe(expected);
  });
});
