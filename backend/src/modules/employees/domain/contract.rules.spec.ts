import { parseDateOnly as d } from '../../../shared/domain/date-only';
import {
  assertContractData,
  assertEndDateChange,
  ContractInput,
  ContractOverlapError,
  InvalidContractError,
  isCurrent,
  planNewContract,
} from './contract.rules';

const base: ContractInput = {
  contractType: 'INDEFINITE',
  startDate: d('2026-01-15'),
  endDate: null,
  baseSalary: '2000000',
  weeklyHours: 42,
};

describe('assertContractData', () => {
  it('acepta un contrato indefinido normal', () => {
    expect(() => assertContractData(base, d('2026-01-15'))).not.toThrow();
  });
  it.each([
    ['empieza antes del ingreso', { startDate: d('2026-01-01') }],
    ['fin antes del inicio', { endDate: d('2026-01-01') }],
    ['término fijo sin fecha de fin', { contractType: 'FIXED_TERM' as const }],
    ['salario con 3 decimales', { baseSalary: '2000000.123' }],
    ['salario cero', { baseSalary: '0' }],
    ['60 horas semanales', { weeklyHours: 60 }],
  ])('rechaza: %s', (_label, over) => {
    expect(() =>
      assertContractData({ ...base, ...over }, d('2026-01-15')),
    ).toThrow(InvalidContractError);
  });
});

describe('planNewContract', () => {
  const first = { id: 'c1', startDate: d('2026-01-15'), endDate: null };

  it('primer contrato: nada que cerrar', () => {
    expect(planNewContract([], base)).toBeNull();
  });

  it('aumento de salario: cierra el vigente el día anterior', () => {
    const plan = planNewContract([first], {
      startDate: d('2026-07-01'),
      endDate: null,
    });
    expect(plan?.closeId).toBe('c1');
    expect(plan?.closeOn.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('no permite un contrato que empiece antes o el mismo día que el vigente', () => {
    expect(() =>
      planNewContract([first], { startDate: d('2026-01-15'), endDate: null }),
    ).toThrow(ContractOverlapError);
  });

  it('no permite pisar un contrato anterior que ya no es el último', () => {
    const old = {
      id: 'c0',
      startDate: d('2025-01-01'),
      endDate: d('2025-12-31'),
    };
    expect(() =>
      planNewContract([old, first], {
        startDate: d('2025-06-01'),
        endDate: null,
      }),
    ).toThrow(ContractOverlapError);
  });

  it('un contrato futuro después de uno terminado no cierra nada', () => {
    const ended = {
      id: 'c1',
      startDate: d('2026-01-15'),
      endDate: d('2026-06-30'),
    };
    expect(
      planNewContract([ended], { startDate: d('2026-08-01'), endDate: null }),
    ).toBeNull();
  });
});

describe('assertEndDateChange e isCurrent', () => {
  const c1 = { id: 'c1', startDate: d('2026-01-15'), endDate: d('2026-06-30') };
  const c2 = { id: 'c2', startDate: d('2026-07-01'), endDate: null };
  it('no deja pisar ni reabrir un contrato que tiene uno siguiente', () => {
    expect(() => assertEndDateChange(c1, [c1, c2], d('2026-07-15'))).toThrow(
      InvalidContractError,
    );
    expect(() => assertEndDateChange(c1, [c1, c2], null)).toThrow(
      InvalidContractError,
    );
    expect(() =>
      assertEndDateChange(c1, [c1, c2], d('2026-06-15')),
    ).not.toThrow();
  });
  it('vigencia', () => {
    expect(isCurrent(c2, d('2026-10-01'))).toBe(true);
    expect(isCurrent(c1, d('2026-10-01'))).toBe(false);
  });
});
