import {
  parseContractType,
  ImportContext,
  validateRows,
} from './employee-import.rules';

const ctx: ImportContext = {
  existingCodes: new Set(['EMP-001']),
  existingDocuments: new Set(['CC:1000000001']),
  positions: new Map([['cajero', 'pos-1']]),
  stores: new Map([['CENTRO', 'store-1']]),
  today: '2026-10-01',
};
const ok = {
  codigo: 'emp-100',
  tipo_documento: 'cc',
  numero_documento: '1.020.304.050',
  nombres: 'María',
  apellidos: 'Gil',
  correo: 'Maria@Correo.com',
  fecha_ingreso: '01/09/2026',
  fecha_nacimiento: '12/04/1995',
  cargo: 'CAJERO',
  sede: 'centro',
  tipo_contrato: 'Indefinido',
  salario: '2.000.000',
  horas_semanales: '42',
  acceso_app: 'Sí',
};
const errorsOf = (over: Record<string, unknown>) =>
  validateRows([{ ...ok, ...over }], ctx)[0].errors.map((e) => e.field);

describe('validateRows', () => {
  it('una fila correcta se normaliza (código, documento, correo, fechas, referencias, contrato)', () => {
    const [r] = validateRows([ok], ctx);
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({
      code: 'EMP-100',
      documentType: 'CC',
      documentNumber: '1020304050',
      email: 'maria@correo.com',
      hireDate: '2026-09-01',
      birthDate: '1995-04-12',
      positionId: 'pos-1',
      storeId: 'store-1',
      appAccess: true,
      contract: {
        contractType: 'INDEFINITE',
        baseSalary: '2000000.00',
        weeklyHours: '42.00',
        endDate: null,
      },
    });
  });

  it('detecta duplicados contra la empresa y dentro del archivo, indicando la fila', () => {
    expect(errorsOf({ codigo: 'EMP-001' })).toEqual(['codigo']);
    expect(errorsOf({ numero_documento: '1000000001' })).toEqual([
      'numero_documento',
    ]);
    const [, second] = validateRows([ok, { ...ok, correo: 'otra@x.com' }], ctx);
    expect(second.errors.map((e) => e.message)).toContain(
      'Repetido en la fila 2',
    );
  });

  it('valida fechas, referencias y contrato', () => {
    expect(errorsOf({ fecha_ingreso: '31/02/2026' })).toEqual([
      'fecha_ingreso',
    ]);
    expect(errorsOf({ fecha_nacimiento: '01/01/2030' })).toEqual([
      'fecha_nacimiento',
    ]);
    expect(errorsOf({ cargo: 'Gerente' })).toEqual(['cargo']);
    expect(errorsOf({ sede: 'NORTE' })).toEqual(['sede']);
    expect(errorsOf({ tipo_contrato: 'FIJO' })).toEqual(['fecha_fin_contrato']);
    expect(errorsOf({ salario: 'mucho' })).toEqual(['salario']);
  });

  it('el contrato es opcional, pero el acceso a la app exige correo', () => {
    expect(
      errorsOf({ tipo_contrato: '', salario: '', horas_semanales: '' }),
    ).toEqual([]);
    expect(errorsOf({ correo: '' })).toEqual(['correo']);
    expect(errorsOf({ correo: '', acceso_app: 'NO' })).toEqual([]);
  });

  it('reporta todos los errores de una fila a la vez', () => {
    expect(
      errorsOf({ codigo: '', nombres: '', fecha_ingreso: 'x' }).sort(),
    ).toEqual(['codigo', 'fecha_ingreso', 'nombres']);
  });
});

describe('parseContractType', () => {
  it.each([
    ['INDEFINIDO', 'INDEFINITE'],
    ['Término indefinido', 'INDEFINITE'],
    ['Contrato a término fijo', 'FIXED_TERM'],
    ['termino-fijo', 'FIXED_TERM'],
    ['Por obra o labor', 'WORK_OR_LABOR'],
    ['OBRA_LABOR', 'WORK_OR_LABOR'],
    ['Contrato de aprendizaje', 'APPRENTICESHIP'],
    ['Prestación de servicios', 'SERVICES'],
    ['Fixed term', 'FIXED_TERM'],
  ])('"%s" → %s', (input, expected) =>
    expect(parseContractType(input)).toBe(expected),
  );

  it('rechaza lo que no reconoce', () => {
    expect(parseContractType('temporal')).toBeNull();
    expect(parseContractType('')).toBeNull();
  });
});
