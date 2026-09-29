import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Module, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './shared/infrastructure/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DomainExceptionFilter } from './shared/presentation/domain-exception.filter';
import { EmployeesModule } from './modules/employees/employees.module';
import { HttpExceptionFilter } from './shared/presentation/http-exception.filter';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { NotificationsModule } from './shared/infrastructure/notifications/notifications.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { RolesModule } from './modules/roles/roles.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }], // Límite general por IP
      errorMessage: 'Demasiadas peticiones. Intente de nuevo en un momento',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    RolesModule,
    UsersModule,
    EmployeesModule,
    StoresModule,
    ShiftsModule,
    NotificationsModule,
    AttendanceModule,
    IncidentsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true, // Elimina campos que no estén en el DTO
        forbidNonWhitelisted: true, // ...y rechaza la petición si los envían
        transform: true,
      }),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    AppService,
  ],
})
export class AppModule {}
