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

  // --- Administrador de la empresa ---
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {},
    create: {
      email: 'admin@demo.local',
      passwordHash,
      firstName: 'Ana',
      lastName: 'Administradora',
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

  // --- Cargo ---
  const position = await prisma.position.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Cajero' } },
    update: {},
    create: { companyId: company.id, name: 'Cajero' },
  });

  // --- Establecimiento y geocerca ---
  // Coordenadas de ejemplo: cámbialas por un lugar donde puedas probar con tu celular.
  const store = await prisma.store.upsert({
    where: { companyId_code: { companyId: company.id, code: 'CENTRO' } },
    update: {},
    create: {
      companyId: company.id,
      code: 'CENTRO',
      name: 'Tienda Centro',
      address: 'Dirección de ejemplo',
      city: 'Bogotá',
      latitude: 4.6097,
      longitude: -74.0817,
    },
  });

  const geofence = await prisma.geofence.findFirst({
    where: { storeId: store.id },
  });
  if (!geofence) {
    await prisma.geofence.create({
      data: {
        companyId: company.id,
        storeId: store.id,
        name: 'Perímetro Tienda Centro',
        centerLatitude: store.latitude,
        centerLongitude: store.longitude,
        radiusMeters: 100,
        maxAccuracyMeters: 50,
      },
    });
  }

  // --- Empleado con acceso a la app ---
  const employeeUser = await prisma.user.upsert({
    where: { email: 'empleado@demo.local' },
    update: {},
    create: {
      email: 'empleado@demo.local',
      passwordHash,
      firstName: 'Carlos',
      lastName: 'Pérez',
    },
  });
  await prisma.companyMembership.upsert({
    where: {
      companyId_userId: { companyId: company.id, userId: employeeUser.id },
    },
    update: { roleId: roles.EMPLOYEE },
    create: {
      companyId: company.id,
      userId: employeeUser.id,
      roleId: roles.EMPLOYEE,
    },
  });

  const employee = await prisma.employee.upsert({
    where: { companyId_code: { companyId: company.id, code: 'EMP-001' } },
    update: {},
    create: {
      companyId: company.id,
      userId: employeeUser.id,
      code: 'EMP-001',
      documentType: 'CC',
      documentNumber: '1000000001',
      firstName: 'Carlos',
      lastName: 'Pérez',
      email: 'empleado@demo.local',
      hireDate: new Date('2026-01-15'),
      positionId: position.id,
      defaultStoreId: store.id,
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
        startDate: new Date('2026-01-15'),
        baseSalary: '2000000.00', // Valor de ejemplo
        weeklyHours: '42.00',
      },
    });
  }

  console.log(
    `✔ Empresa demo "${company.name}" con admin, tienda, geocerca y empleado`,
  );
  console.log(
    `  admin@demo.local / empleado@demo.local  →  contraseña: ${devPassword}`,
  );
}

// =====================================================================

async function main() {
  await seedPermissions();
  const roles = await seedSystemRoles();
  await seedPlatformAdmin();

  if (process.env.NODE_ENV !== 'production') {
    await seedDemoCompany(roles);
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
