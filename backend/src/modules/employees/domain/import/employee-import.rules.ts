import type { ContractType } from '../contract.rules';
import type { DocumentType } from '../employee.types';
import { normalize, parseDate, parseMoney, parseYesNo } from './values';

export interface ImportColumn {
  key: string;
  required?: boolean;
  example: string;
  help: string;
}

/** Columnas de la plantilla (el orden es el de la plantilla). */
export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: 'codigo',
    required: true,
    example: 'EMP-100',
    help: 'Único en la empresa. Letras, números, "-" y "_".',
  },
  {
    key: 'tipo_documento',
    required: true,
    example: 'CC',
    help: 'CC, CE, TI, PPT, PASAPORTE u OTRO.',
  },
  {
    key: 'numero_documento',
    required: true,
    example: '1020304050',
    help: 'Sin puntos ni espacios (si los tiene, se quitan).',
  },
  {
    key: 'nombres',
    required: true,
    example: 'María José',
    help: 'Hasta 80 caracteres.',
  },
  {
    key: 'apellidos',
    required: true,
    example: 'Rodríguez Gil',
    help: 'Hasta 80 caracteres.',
  },
  {
    key: 'correo',
    example: 'maria@correo.com',
    help: 'Obligatorio si acceso_app = SI.',
  },
  { key: 'telefono', example: '+57 310 555 1234', help: 'Opcional.' },
  {
    key: 'fecha_nacimiento',
    example: '12/04/1995',
    help: 'DD/MM/AAAA o AAAA-MM-DD.',
  },
  {
    key: 'fecha_ingreso',
    required: true,
    example: '01/09/2026',
    help: 'DD/MM/AAAA o AAAA-MM-DD.',
  },
  {
    key: 'cargo',
    example: 'Cajero',
    help: 'Nombre de un cargo que ya exista.',
  },
  {
    key: 'sede',
    example: 'CENTRO',
    help: 'Código del establecimiento principal.',
  },
  {
    key: 'tipo_contrato',
    example: 'INDEFINIDO',
    help: 'INDEFINIDO, FIJO, OBRA_LABOR, APRENDIZAJE o SERVICIOS. Si lo llena, llene también salario y horas.',
  },
  {
    key: 'salario',
    example: '2.000.000',
    help: 'Salario base mensual. Acepta 2.000.000 o 2000000.',
  },
  { key: 'horas_semanales', example: '42', help: 'Jornada semanal.' },
  {
    key: 'fecha_fin_contrato',
    example: '',
    help: 'Obligatoria para FIJO y APRENDIZAJE.',
  },
  {
    key: 'acceso_app',
    example: 'SI',
    help: 'SI = se crea su cuenta y recibe un correo para crear su contraseña.',
  },
];

export const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((c) => c.required).map(
  (c) => c.key,
);

const DOCUMENT_TYPES: Record<string, DocumentType> = {
  cc: 'CC',
  ce: 'CE',
  ti: 'TI',
  ppt: 'PPT',
  pasaporte: 'PASSPORT',
  passport: 'PASSPORT',
  otro: 'OTHER',
  other: 'OTHER',
};
const CONTRACT_TYPES: Record<string, ContractType> = {
  indefinido: 'INDEFINITE',
  indefinite: 'INDEFINITE',
  fijo: 'FIXED_TERM',
  fixed: 'FIXED_TERM',
  fixed_term: 'FIXED_TERM',
  obra_labor: 'WORK_OR_LABOR',
  work_labor: 'WORK_OR_LABOR',
  work_or_labor: 'WORK_OR_LABOR',
  aprendizaje: 'APPRENTICESHIP',
  apprenticeship: 'APPRENTICESHIP',
  servicios: 'SERVICES',
  prestacion_servicios: 'SERVICES',
  services: 'SERVICES',
};

/** Palabras de relleno: "Contrato a término indefinido" → "indefinido". */
const FILLER = new Set(['contrato', 'a', 'termino', 'de', 'por', 'o', 'term']);

/** Acepta el tipo de contrato como lo escribiría una persona de RRHH. */
export function parseContractType(value: string): ContractType | null {
  const key = normalize(value)
    .split(/[\s_/-]+/)
    .filter((w) => w && !FILLER.has(w))
    .join('_');
  return CONTRACT_TYPES[key] ?? null;
}

export type RawRow = Record<string, unknown>;

export interface ImportContext {
  existingCodes: Set<string>;
  /** "CC:1020304050" */
  existingDocuments: Set<string>;
  /** nombre normalizado → id */
  positions: Map<string, string>;
  /** código en mayúsculas → id */
  stores: Map<string, string>;
  /** Fecha local de hoy (AAAA-MM-DD). */
  today: string;
}

export interface ImportedEmployee {
  code: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  hireDate: string;
  positionId: string | null;
  storeId: string | null;
  contract: {
    contractType: ContractType;
    baseSalary: string;
    weeklyHours: string;
    endDate: string | null;
  } | null;
  appAccess: boolean;
}

export interface RowError {
  field: string;
  message: string;
}

export interface RowResult {
  /** Número de fila en el archivo (como lo ve el usuario en Excel). */
  row: number;
  raw: Record<string, string>;
  data: ImportedEmployee | null;
  errors: RowError[];
}

const str = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Valida todas las filas sin tocar la base: duplicados dentro del archivo y contra la
 * empresa, formatos, fechas, cargo y sede existentes, contrato completo y coherente.
 * `firstRow` es el número de fila de Excel donde empiezan los datos.
 */
export function validateRows(
  rows: RawRow[],
  ctx: ImportContext,
  firstRow = 2,
): RowResult[] {
  const seenCodes = new Map<string, number>();
  const seenDocs = new Map<string, number>();
  const seenEmails = new Map<string, number>();

  return rows.map((r, i) => {
    // El lector indica la fila real de Excel (las filas vacías se saltan sin desordenar números)
    const row = typeof r.__row === 'number' ? r.__row : firstRow + i;
    const raw = Object.fromEntries(
      Object.entries(r)
        .filter(([k]) => k !== '__row')
        .map(([k, v]) => [k, str(v)]),
    );
    const errors: RowError[] = [];
    const fail = (field: string, message: string) =>
      errors.push({ field, message });

    // --- Identificación ---
    const code = str(r.codigo).toUpperCase();
    if (!code) fail('codigo', 'Obligatorio');
    else if (!/^[A-Z0-9_-]{1,30}$/.test(code))
      fail('codigo', 'Solo letras, números, "-" y "_" (máx. 30)');
    else if (ctx.existingCodes.has(code))
      fail('codigo', `Ya existe un empleado con el código ${code}`);
    else if (seenCodes.has(code))
      fail('codigo', `Repetido en la fila ${seenCodes.get(code)}`);
    else seenCodes.set(code, row);

    const documentType = DOCUMENT_TYPES[normalize(str(r.tipo_documento))];
    if (!documentType)
      fail('tipo_documento', 'Use CC, CE, TI, PPT, PASAPORTE u OTRO');
    const documentNumber = str(r.numero_documento)
      .replace(/[.\s]/g, '')
      .toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(documentNumber))
      fail('numero_documento', 'Entre 3 y 20 letras o números');
    else if (documentType) {
      const key = `${documentType}:${documentNumber}`;
      if (ctx.existingDocuments.has(key))
        fail('numero_documento', 'Ya existe un empleado con ese documento');
      else if (seenDocs.has(key))
        fail('numero_documento', `Repetido en la fila ${seenDocs.get(key)}`);
      else seenDocs.set(key, row);
    }

    const firstName = str(r.nombres);
    const lastName = str(r.apellidos);
    if (!firstName || firstName.length > 80)
      fail('nombres', 'Obligatorio (máx. 80 caracteres)');
    if (!lastName || lastName.length > 80)
      fail('apellidos', 'Obligatorio (máx. 80 caracteres)');

    const email = str(r.correo).toLowerCase() || null;
    if (email && !EMAIL.test(email)) fail('correo', 'No es un correo válido');
    else if (email && seenEmails.has(email))
      fail('correo', `Repetido en la fila ${seenEmails.get(email)}`);
    else if (email) seenEmails.set(email, row);

    const phone = str(r.telefono) || null;
    if (phone && !/^\+?[0-9 ]{7,20}$/.test(phone))
      fail('telefono', 'Solo números, espacios y "+" (7 a 20)');

    // --- Fechas ---
    const hireDate = parseDate(r.fecha_ingreso);
    if (!hireDate)
      fail('fecha_ingreso', 'Obligatoria. Use DD/MM/AAAA o AAAA-MM-DD');
    const birthDate = str(r.fecha_nacimiento)
      ? parseDate(r.fecha_nacimiento)
      : null;
    if (str(r.fecha_nacimiento) && !birthDate)
      fail('fecha_nacimiento', 'Fecha no válida');
    if (birthDate && hireDate && birthDate >= hireDate) {
      fail('fecha_nacimiento', 'Debe ser anterior a la fecha de ingreso');
    }

    // --- Referencias ---
    const positionName = str(r.cargo);
    const positionId = positionName
      ? (ctx.positions.get(normalize(positionName)) ?? null)
      : null;
    if (positionName && !positionId)
      fail('cargo', `No existe el cargo "${positionName}"`);
    const storeCode = str(r.sede).toUpperCase();
    const storeId = storeCode ? (ctx.stores.get(storeCode) ?? null) : null;
    if (storeCode && !storeId)
      fail('sede', `No existe un establecimiento con código ${storeCode}`);

    // --- Contrato (opcional, pero completo si se usa) ---
    let contract: ImportedEmployee['contract'] = null;
    const hasContract = [r.tipo_contrato, r.salario, r.horas_semanales].some(
      (v) => str(v) !== '',
    );
    if (hasContract) {
      const contractType = parseContractType(str(r.tipo_contrato));
      const baseSalary = parseMoney(r.salario);
      const hours = Number(str(r.horas_semanales).replace(',', '.'));
      const endDate = str(r.fecha_fin_contrato)
        ? parseDate(r.fecha_fin_contrato)
        : null;
      if (!contractType)
        fail(
          'tipo_contrato',
          'Use INDEFINIDO, FIJO, OBRA_LABOR, APRENDIZAJE o SERVICIOS',
        );
      if (!baseSalary || Number(baseSalary) <= 0)
        fail('salario', 'Monto no válido');
      if (!Number.isFinite(hours) || hours < 1 || hours > 60)
        fail('horas_semanales', 'Entre 1 y 60');
      if (str(r.fecha_fin_contrato) && !endDate)
        fail('fecha_fin_contrato', 'Fecha no válida');
      if (
        contractType &&
        (contractType === 'FIXED_TERM' || contractType === 'APPRENTICESHIP') &&
        !endDate
      ) {
        fail(
          'fecha_fin_contrato',
          'Obligatoria para contratos a término fijo o de aprendizaje',
        );
      }
      if (contractType === 'INDEFINITE' && endDate)
        fail(
          'fecha_fin_contrato',
          'Un contrato indefinido no lleva fecha final',
        );
      if (endDate && hireDate && endDate < hireDate)
        fail('fecha_fin_contrato', 'Es anterior a la fecha de ingreso');
      if (contractType && baseSalary && Number.isFinite(hours)) {
        contract = {
          contractType,
          baseSalary,
          weeklyHours: hours.toFixed(2),
          endDate,
        };
      }
    }

    // --- Acceso a la app ---
    const appAccess = parseYesNo(r.acceso_app);
    if (appAccess === null) fail('acceso_app', 'Use SI o NO');
    if (appAccess && !email)
      fail('correo', 'Obligatorio para dar acceso a la app');

    return {
      row,
      raw,
      errors,
      data:
        errors.length === 0
          ? {
              code,
              documentType: documentType!,
              documentNumber,
              firstName,
              lastName,
              email,
              phone,
              birthDate,
              hireDate: hireDate!,
              positionId,
              storeId,
              contract,
              appAccess: appAccess ?? false,
            }
          : null,
    };
  });
}
