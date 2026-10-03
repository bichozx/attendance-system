import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppService } from './app.service';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './shared/infrastructure/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DomainExceptionFilter } from './shared/presentation/domain-exception.filter';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { HttpExceptionFilter } from './shared/presentation/http-exception.filter';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { LoggerModule } from 'nestjs-pino';
import { MailModule } from './shared/infrastructure/mail/mail.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NotificationCenterModule } from './modules/notifications/notification-center.module';
import { NotificationsModule } from './shared/infrastructure/notifications/notifications.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { PushModule } from './shared/infrastructure/push/push.module';
import { RedisModule } from './shared/infrastructure/redis/redis.module';
import { RedisService } from './shared/infrastructure/redis/redis.service';
import { RedisThrottlerStorage } from './shared/infrastructure/throttling/redis-throttler.storage';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { loggingConfig } from './shared/infrastructure/logging/logging.config';
import { validateEnv } from './shared/infrastructure/config/env.validation';

@Module({
  imports: [
    // Falla al arrancar si la configuración es inválida
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        loggingConfig({
          NODE_ENV: config.get('NODE_ENV'),
          LOG_LEVEL: config.get('LOG_LEVEL'),
          LOG_PRETTY: config.get('LOG_PRETTY'),
        }),
    }),
    RedisModule,
    // Con REDIS_URL, el conteo es compartido entre todas las instancias del backend
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }], // Límite general por IP
        errorMessage: 'Demasiadas peticiones. Intente de nuevo en un momento',
        ...(redis.client && {
          storage: new RedisThrottlerStorage(redis.client),
        }),
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    MailModule,
    PushModule,
    NotificationsModule,
    HealthModule,
    MaintenanceModule,
    AuthModule,
    CompaniesModule,
    RolesModule,
    UsersModule,
    EmployeesModule,
    StoresModule,
    ShiftsModule,
    AttendanceModule,
    IncidentsModule,
    NotificationCenterModule,
    ReportsModule,
  ],
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
