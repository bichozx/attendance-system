import 'dotenv/config';

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// =====================================================================
// 1. CATÁLOGO DE PERMISOS (global)
// =====================================================================

const PERMISSIONS = [
  {
    code: 'companies.read',
    module: 'companies',
    description: 'Ver datos de la empresa',
  },
  {
    code: 'companies.update',
    module: 'companies',
    description: 'Editar configuración de la empresa',
  },
  {
    code: 'users.read',
    module: 'users',
    description: 'Ver usuarios de la empresa',
  },
  {
    code: 'users.manage',
    module: 'users',
    description: 'Invitar, editar y desactivar usuarios',
  },
  { code: 'roles.read', module: 'roles', description: 'Ver roles y permisos' },
  {
    code: 'roles.manage',
    module: 'roles',
    description: 'Crear y editar roles',
  },
  { code: 'employees.read', module: 'employees', description: 'Ver empleados' },
  {
    code: 'employees.manage',
    module: 'employees',
    description: 'Crear, editar e importar empleados',
  },
  {
    code: 'contracts.read',
    module: 'employees',
    description: 'Ver contratos y salarios',
  },
  {
    code: 'contracts.manage',
    module: 'employees',
    description: 'Gestionar contratos y salarios',
  },
  {
    code: 'stores.read',
    module: 'stores',
    description: 'Ver establecimientos',
  },
  {
    code: 'stores.manage',
    module: 'stores',
    description: 'Gestionar establecimientos y geocercas',
  },
  {
    code: 'shifts.read_own',
    module: 'shifts',
    description: 'Ver sus propios turnos',
  },
  {
    code: 'shifts.read',
    module: 'shifts',
    description: 'Ver todos los turnos',
  },
  {
    code: 'shifts.manage',
    module: 'shifts',
    description: 'Crear, editar y asignar turnos',
  },
  {
    code: 'shifts.publish',
    module: 'shifts',
    description: 'Publicar periodos (quincenas)',
  },
  {
    code: 'shift_changes.request',
    module: 'shifts',
    description: 'Solicitar cambios de turno',
  },
  {
    code: 'shift_changes.approve',
    module: 'shifts',
    description: 'Aprobar o rechazar cambios de turno',
  },
  {
    code: 'attendance.clock',
    module: 'attendance',
    description: 'Marcar entrada y salida',
  },
  {
    code: 'attendance.read_own',
    module: 'attendance',
    description: 'Ver su propia asistencia',
  },
  {
    code: 'attendance.read',
    module: 'attendance',
    description: 'Ver asistencia de todos',
  },
  {
    code: 'attendance.adjust',
    module: 'attendance',
    description: 'Hacer ajustes manuales de asistencia',
  },
  {
    code: 'incidents.request',
    module: 'incidents',
    description: 'Reportar novedades propias',
  },
  {
    code: 'incidents.read_own',
    module: 'incidents',
    description: 'Ver sus propias novedades',
  },
  {
    code: 'incidents.read',
    module: 'incidents',
    description: 'Ver todas las novedades',
  },
  {
    code: 'incidents.approve',
    module: 'incidents',
    description: 'Aprobar o rechazar novedades',
  },
  {
    code: 'notifications.send',
    module: 'notifications',
    description: 'Enviar avisos administrativos',
  },
  { code: 'reports.read', module: 'reports', description: 'Ver reportes' },
  {
    code: 'reports.export',
    module: 'reports',
    description: 'Exportar reportes a Excel/PDF',
  },
  {
    code: 'audit.read',
    module: 'audit',
    description: 'Consultar la auditoría',
  },
] as const;

type PermissionCode = (typeof PERMISSIONS)[number]['code'];

// =====================================================================
// 2. ROLES DEL SISTEMA (companyId = null, disponibles para todas las empresas)
// =====================================================================

const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.code);

const SYSTEM_ROLES: {
  code: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}[] = [
  {
    code: 'COMPANY_ADMIN',
    name: 'Administrador',
    description: 'Acceso total dentro de su empresa',
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'SUPERVISOR',
    name: 'Supervisor',
    description: 'Gestiona turnos, asistencia y novedades de su equipo',
    permissions: [
      'employees.read',
      'stores.read',
      'shifts.read',
      'shifts.manage',
      'shifts.publish',
      'shift_changes.approve',
      'attendance.read',
      'attendance.adjust',
      'incidents.read',
      'incidents.approve',
      'reports.read',
      'reports.export',
    ],
  },
  {
    code: 'EMPLOYEE',
    name: 'Empleado',
    description: 'Marca asistencia y gestiona sus propias solicitudes',
    permissions: [
      'shifts.read_own',
      'shift_changes.request',
      'attendance.clock',
      'attendance.read_own',
      'incidents.request',
      'incidents.read_own',
    ],
  },
];

async function seedPermissions() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }
  console.log(`✔ ${PERMISSIONS.length} permisos`);
}

async function seedSystemRoles() {
  const permissions = await prisma.permission.findMany();
  const idByCode = new Map(permissions.map((p) => [p.code, p.id]));
  const roles: Record<string, string> = {};

  for (const r of SYSTEM_ROLES) {
    // companyId null no sirve en un upsert compuesto: buscamos y luego creamos/actualizamos.
    const existing = await prisma.role.findFirst({
      where: { companyId: null, code: r.code },
    });

    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: r.name, description: r.description, isSystem: true },
        })
      : await prisma.role.create({
          data: {
            code: r.code,
            name: r.name,
            description: r.description,
            isSystem: true,
          },
        });

    // Sincroniza permisos: el seed es la fuente de verdad de los roles del sistema.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: r.permissions.map((code) => ({
        roleId: role.id,
        permissionId: idByCode.get(code)!,
      })),
    });

    roles[r.code] = role.id;
  }
  console.log(`✔ ${SYSTEM_ROLES.length} roles del sistema`);
  return roles;
}

// =====================================================================
// 3. SUPERADMINISTRADOR DE LA PLATAFORMA
// =====================================================================

async function seedPlatformAdmin() {
  const email =
    process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'superadmin@asistencia.local';
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? 'Cambiar123!';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await hash(password),
      firstName: 'Super',
      lastName: 'Admin',
      isPlatformAdmin: true,
    },
  });
  console.log(`✔ Superadmin: ${email}`);
}

// =====================================================================
// 4. EMPRESA DEMO (solo desarrollo)
// =====================================================================

/**
 * SEED_DEMO_SCENARIOS=false → seed mínimo (solo Carlos y Tienda Centro). Lo usan las pruebas
 * automáticas, que crean su propio personal (Ana, Luis, Tienda Norte...) y chocarían con el demo.
 */
const MINIMAL_SEED = process.env.SEED_DEMO_SCENARIOS === 'false';

async function seedDemoCompany(roles: Record<string, string>) {
  const devPassword = process.env.SEED_DEMO_PASSWORD ?? 'Demo123!';
  const passwordHash = await hash(devPassword);

  const company = await prisma.company.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Empresa Demo',
      legalName: 'Empresa Demo S.A.S.',
      taxId: '900000000-0',
      slug: 'demo',
      status: 'ACTIVE',
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: { firstName: 'Ana', lastName: 'Administradora' },
    create: {
      email: 'admin@demo.local',
      passwordHash,
      firstName: 'Ana',
      lastName: 'Administradora',
      mustChangePassword: false,
    },
  });
  await prisma.companyMembership.upsert({
    where: {
      companyId_userId: { companyId: company.id, userId: adminUser.id },
    },
    update: { roleId: roles.COMPANY_ADMIN },
    create: {
      companyId: company.id,
      userId: adminUser.id,
      roleId: roles.COMPANY_ADMIN,
    },
  });

  const allDemoEmployees = [
    {
      email: 'empleado@demo.local',
      firstName: 'Carlos',
      lastName: 'Pérez',
      roleCode: 'EMPLOYEE' as const,
      employee: {
        code: 'EMP-001',
        documentType: 'CC' as const,
        documentNumber: '1000000001',
        firstName: 'Carlos',
        lastName: 'Pérez',
        hireDate: new Date('2026-01-15'),
      },
    },
    {
      email: 'laura@demo.local',
      firstName: 'Laura',
      lastName: 'Gómez',
      roleCode: 'SUPERVISOR' as const,
      employee: {
        code: 'E-LAURA',
        documentType: 'CC' as const,
        documentNumber: '4444444444',
        firstName: 'Laura',
        lastName: 'Gómez',
        hireDate: new Date('2026-01-10'),
      },
    },
    {
      email: 'ana@demo.local',
      firstName: 'Ana',
      lastName: 'Ruiz',
      roleCode: 'EMPLOYEE' as const,
      employee: {
        code: 'E-ANA',
        documentType: 'CC' as const,
        documentNumber: '1111111111',
        firstName: 'Ana',
        lastName: 'Ruiz',
        hireDate: new Date('2026-01-10'),
      },
    },
    {
      email: 'luis@demo.local',
      firstName: 'Luis',
      lastName: 'Martínez',
      roleCode: 'EMPLOYEE' as const,
      employee: {
        code: 'E-LUIS',
        documentType: 'CC' as const,
        documentNumber: '2222222222',
        firstName: 'Luis',
        lastName: 'Martínez',
        hireDate: new Date('2026-01-10'),
      },
    },
    {
      email: 'sofia@demo.local',
      firstName: 'Sofía',
      lastName: 'Hernández',
      roleCode: 'EMPLOYEE' as const,
      employee: {
        code: 'E-SOFIA',
        documentType: 'CC' as const,
        documentNumber: '3333333333',
        firstName: 'Sofía',
        lastName: 'Hernández',
        hireDate: new Date('2026-01-10'),
      },
    },
  ];
  const demoEmployees = MINIMAL_SEED ? allDemoEmployees.slice(0, 1) : allDemoEmployees;

  const positions = await Promise.all(
    ['Cajero', 'Supervisor', 'Auxiliar'].map(async (name) =>
      prisma.position.upsert({
        where: { companyId_name: { companyId: company.id, name } },
        update: {},
        create: { companyId: company.id, name },
      }),
    ),
  );
  const positionByName = new Map(positions.map((p) => [p.name, p]));

  const stores = await Promise.all(
    [
      {
        code: 'CENTRO',
        name: 'Tienda Centro',
        address: 'Dirección de ejemplo',
        city: 'Bogotá',
        latitude: 4.6097,
        longitude: -74.0817,
      },
      {
        code: 'NORTE',
        name: 'Tienda Norte',
        address: 'Dirección norte de ejemplo',
        city: 'Bogotá',
        latitude: 4.6619,
        longitude: -74.0917,
      },
    ]
      .slice(0, MINIMAL_SEED ? 1 : undefined)
      .map(async (store) =>
      prisma.store.upsert({
        where: { companyId_code: { companyId: company.id, code: store.code } },
        update: {},
        create: {
          companyId: company.id,
          ...store,
        },
      }),
    ),
  );
  const primaryStore = stores[0];

  for (const store of stores) {
    const geofence = await prisma.geofence.findFirst({
      where: { storeId: store.id },
    });
    if (!geofence) {
      await prisma.geofence.create({
        data: {
          companyId: company.id,
          storeId: store.id,
          name: `Perímetro ${store.name}`,
          centerLatitude: store.latitude,
          centerLongitude: store.longitude,
          radiusMeters: 100,
          maxAccuracyMeters: 50,
        },
      });
    }
  }

  for (const demoEmployee of demoEmployees) {
    const user = await prisma.user.upsert({
      where: { email: demoEmployee.email },
      update: {
        firstName: demoEmployee.firstName,
        lastName: demoEmployee.lastName,
      },
      create: {
        email: demoEmployee.email,
        passwordHash,
        firstName: demoEmployee.firstName,
        lastName: demoEmployee.lastName,
        mustChangePassword: false,
      },
    });

    await prisma.companyMembership.upsert({
      where: {
        companyId_userId: { companyId: company.id, userId: user.id },
      },
      update: { roleId: roles[demoEmployee.roleCode] },
      create: {
        companyId: company.id,
        userId: user.id,
        roleId: roles[demoEmployee.roleCode],
      },
    });

    const employee = await prisma.employee.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: demoEmployee.employee.code,
        },
      },
      update: {
        userId: user.id,
        firstName: demoEmployee.employee.firstName,
        lastName: demoEmployee.employee.lastName,
        email: demoEmployee.email,
        documentType: demoEmployee.employee.documentType,
        documentNumber: demoEmployee.employee.documentNumber,
        hireDate: demoEmployee.employee.hireDate,
        positionId: positionByName.get(
          demoEmployee.roleCode === 'SUPERVISOR' ? 'Supervisor' : 'Cajero',
        )?.id,
        defaultStoreId: primaryStore.id,
      },
      create: {
        companyId: company.id,
        userId: user.id,
        code: demoEmployee.employee.code,
        documentType: demoEmployee.employee.documentType,
        documentNumber: demoEmployee.employee.documentNumber,
        firstName: demoEmployee.employee.firstName,
        lastName: demoEmployee.employee.lastName,
        email: demoEmployee.email,
        hireDate: demoEmployee.employee.hireDate,
        positionId: positionByName.get(
          demoEmployee.roleCode === 'SUPERVISOR' ? 'Supervisor' : 'Cajero',
        )?.id,
        defaultStoreId: primaryStore.id,
      },
    });

    const contract = await prisma.employmentContract.findFirst({
      where: { employeeId: employee.id },
    });
    if (!contract) {
      await prisma.employmentContract.create({
        data: {
          companyId: company.id,
          employeeId: employee.id,
          contractType: 'INDEFINITE',
          startDate: demoEmployee.employee.hireDate,
          baseSalary: '2000000.00',
          weeklyHours: '42.00',
        },
      });
    }
  }

  console.log(
    `✔ Empresa demo "${company.name}" con administrador, supervisora, empleados y tiendas`,
  );
  console.log(
    `  admin@demo.local · empleado@demo.local · laura@demo.local · ana@demo.local · luis@demo.local · sofia@demo.local  →  contraseña: ${devPassword}`,
  );
}

async function seedDemoScenarios() {
  const company = await prisma.company.findUniqueOrThrow({
    where: { slug: 'demo' },
  });
  const store = await prisma.store.findFirstOrThrow({
    where: { companyId: company.id, code: 'CENTRO' },
  });
  const geofence = await prisma.geofence.findFirstOrThrow({
    where: { storeId: store.id },
  });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@demo.local' },
  });
  const employees = await prisma.employee.findMany({
    where: {
      companyId: company.id,
      code: { in: ['EMP-001', 'E-ANA', 'E-LUIS', 'E-SOFIA'] },
    },
    select: { id: true, code: true, userId: true },
  });
  const employeeByCode = new Map(
    employees.map((employee) => [employee.code, employee]),
  );
  const carlos = employeeByCode.get('EMP-001');
  const ana = employeeByCode.get('E-ANA');
  const luis = employeeByCode.get('E-LUIS');
  const sofia = employeeByCode.get('E-SOFIA');

  if (!carlos || !ana || !luis || !sofia) {
    throw new Error(
      'No se encontraron todos los empleados demo para crear escenarios.',
    );
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: company.timezone,
  }).format(new Date());
  const dateOffset = (days: number) => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const at = (days: number, time: string) =>
    new Date(`${dateOffset(days)}T${time}:00-05:00`);
  const periodName = 'Escenario demo completo';
  const existingPeriod = await prisma.schedulePeriod.findFirst({
    where: { companyId: company.id, storeId: store.id, name: periodName },
  });

  if (existingPeriod) {
    console.log('ℹ Los escenarios de turnos y asistencia demo ya existen');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const publishedAt = new Date();
    const period = await tx.schedulePeriod.create({
      data: {
        companyId: company.id,
        storeId: store.id,
        name: periodName,
        startDate: new Date(`${dateOffset(-10)}T00:00:00.000Z`),
        endDate: new Date(`${dateOffset(14)}T00:00:00.000Z`),
        status: 'PUBLISHED',
        publishedAt,
        publishedById: admin.id,
      },
    });

    const createAssignedShift = async (
      employeeId: string,
      day: number,
      notes: string,
    ) => {
      const startsAt = at(day, '08:00');
      const endsAt = at(day, '16:00');
      const shift = await tx.shift.create({
        data: {
          companyId: company.id,
          storeId: store.id,
          schedulePeriodId: period.id,
          startsAt,
          endsAt,
          breakMinutes: 60,
          earlyClockInMinutes: 5,
          lateToleranceMinutes: 5,
          notes,
          createdById: admin.id,
        },
      });
      const assignment = await tx.shiftAssignment.create({
        data: {
          companyId: company.id,
          shiftId: shift.id,
          employeeId,
          assignedById: admin.id,
        },
      });
      return { shift, assignment, startsAt, endsAt };
    };

    const completed = await createAssignedShift(
      carlos.id,
      -4,
      'Escenario demo: jornada completada con tardanza y horas extra.',
    );
    const clockInAt = new Date(completed.startsAt.getTime() + 15 * 60_000);
    const clockOutAt = new Date(completed.endsAt.getTime() + 10 * 60_000);
    const completedAttendance = await tx.attendance.create({
      data: {
        companyId: company.id,
        shiftAssignmentId: completed.assignment.id,
        employeeId: carlos.id,
        workDate: new Date(`${dateOffset(-4)}T00:00:00.000Z`),
        status: 'COMPLETED',
        clockInAt,
        clockInLatitude: store.latitude,
        clockInLongitude: store.longitude,
        clockInAccuracy: 8,
        clockOutAt,
        clockOutLatitude: store.latitude,
        clockOutLongitude: store.longitude,
        clockOutAccuracy: 8,
        lateMinutes: 15,
        workedMinutes: 415,
        overtimeMinutes: 10,
      },
    });
    await tx.attendanceEvent.createMany({
      data: [
        {
          companyId: company.id,
          employeeId: carlos.id,
          attendanceId: completedAttendance.id,
          type: 'CLOCK_IN',
          result: 'ACCEPTED',
          serverTimestamp: clockInAt,
          latitude: store.latitude,
          longitude: store.longitude,
          accuracyMeters: 8,
          distanceMeters: 0,
          withinGeofence: true,
          geofenceId: geofence.id,
          idempotencyKey: 'seed-demo-carlos-clock-in',
        },
        {
          companyId: company.id,
          employeeId: carlos.id,
          attendanceId: completedAttendance.id,
          type: 'CLOCK_OUT',
          result: 'ACCEPTED',
          serverTimestamp: clockOutAt,
          latitude: store.latitude,
          longitude: store.longitude,
          accuracyMeters: 8,
          distanceMeters: 0,
          withinGeofence: true,
          geofenceId: geofence.id,
          idempotencyKey: 'seed-demo-carlos-clock-out',
        },
      ],
    });
    await tx.incident.create({
      data: {
        companyId: company.id,
        employeeId: carlos.id,
        attendanceId: completedAttendance.id,
        type: 'LATE_ARRIVAL',
        status: 'PENDING',
        startsAt: clockInAt,
        minutes: 15,
        description: 'Soporte de ejemplo para revisar una llegada tarde.',
        requestedById: carlos.userId,
      },
    });
    await tx.incident.create({
      data: {
        companyId: company.id,
        employeeId: carlos.id,
        attendanceId: completedAttendance.id,
        type: 'OVERTIME',
        status: 'APPROVED',
        startsAt: completed.endsAt,
        endsAt: clockOutAt,
        minutes: 10,
        description: 'Cierre de caja de ejemplo aprobado.',
        requestedById: carlos.userId,
        reviewedById: admin.id,
        reviewedAt: publishedAt,
        reviewNotes: 'Aprobado como dato de demostración.',
      },
    });

    const incomplete = await createAssignedShift(
      luis.id,
      -2,
      'Escenario demo: jornada sin marcación de salida.',
    );
    const incompleteClockIn = new Date(
      incomplete.startsAt.getTime() + 2 * 60_000,
    );
    const incompleteAttendance = await tx.attendance.create({
      data: {
        companyId: company.id,
        shiftAssignmentId: incomplete.assignment.id,
        employeeId: luis.id,
        workDate: new Date(`${dateOffset(-2)}T00:00:00.000Z`),
        status: 'INCOMPLETE',
        clockInAt: incompleteClockIn,
        clockInLatitude: store.latitude,
        clockInLongitude: store.longitude,
        clockInAccuracy: 12,
        needsReview: true,
        reviewReasons: ['MISSING_CLOCK_OUT'],
      },
    });
    await tx.attendanceEvent.create({
      data: {
        companyId: company.id,
        employeeId: luis.id,
        attendanceId: incompleteAttendance.id,
        type: 'CLOCK_IN',
        result: 'ACCEPTED',
        serverTimestamp: incompleteClockIn,
        latitude: store.latitude,
        longitude: store.longitude,
        accuracyMeters: 12,
        distanceMeters: 0,
        withinGeofence: true,
        geofenceId: geofence.id,
        idempotencyKey: 'seed-demo-luis-clock-in',
      },
    });
    await tx.incident.create({
      data: {
        companyId: company.id,
        employeeId: luis.id,
        attendanceId: incompleteAttendance.id,
        type: 'MISSED_CLOCK',
        status: 'PENDING',
        startsAt: incomplete.endsAt,
        description: 'Luis reporta que olvidó registrar su salida.',
        requestedById: luis.userId,
      },
    });

    const absent = await createAssignedShift(
      ana.id,
      -3,
      'Escenario demo: ausencia pendiente de revisión.',
    );
    await tx.attendance.create({
      data: {
        companyId: company.id,
        shiftAssignmentId: absent.assignment.id,
        employeeId: ana.id,
        workDate: new Date(`${dateOffset(-3)}T00:00:00.000Z`),
        status: 'ABSENT',
        needsReview: true,
        reviewReasons: ['NO_CLOCK_IN'],
      },
    });

    await createAssignedShift(
      carlos.id,
      1,
      'Escenario demo: próximo turno de Carlos.',
    );
    await createAssignedShift(
      ana.id,
      2,
      'Escenario demo: próximo turno de Ana.',
    );
    await createAssignedShift(
      luis.id,
      3,
      'Escenario demo: próximo turno de Luis.',
    );
    await createAssignedShift(
      sofia.id,
      4,
      'Escenario demo: próximo turno de Sofía.',
    );

    await tx.incident.create({
      data: {
        companyId: company.id,
        employeeId: sofia.id,
        type: 'SICK_LEAVE',
        status: 'APPROVED',
        startsAt: at(8, '00:00'),
        endsAt: at(10, '00:00'),
        description: 'Incapacidad de ejemplo aprobada para demostración.',
        requestedById: sofia.userId,
        reviewedById: admin.id,
        reviewedAt: publishedAt,
        reviewNotes: 'Soporte validado en el escenario demo.',
      },
    });
  });

  console.log(
    '✔ Escenarios demo: periodo publicado, turnos futuros, asistencia histórica y novedades',
  );
}

// =====================================================================

async function main() {
  await seedPermissions();
  const roles = await seedSystemRoles();
  await seedPlatformAdmin();

  if (process.env.NODE_ENV !== 'production') {
    await seedDemoCompany(roles);
    if (process.env.SEED_DEMO_SCENARIOS !== 'false') {
      await seedDemoScenarios();
    }
  } else {
    console.log('ℹ Producción: se omiten los datos demo');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
