// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   await app.listen(process.env.PORT ?? 3000);
// }
// void bootstrap();

import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { setupSwagger } from './shared/presentation/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.enableCors({
    origin: (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3001')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  // Número de proxies delante de la app en producción (0 en local)
  app.set('trust proxy', Number(config.get<string>('TRUST_PROXY_HOPS') ?? 0));

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  // Swagger activo fuera de producción, salvo que SWAGGER_ENABLED diga lo contrario
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const swaggerEnabled =
    config.get<string>(
      'SWAGGER_ENABLED',
      nodeEnv === 'production' ? 'false' : 'true',
    ) === 'true';
  if (swaggerEnabled) setupSwagger(app);

  const warnings = config.get<string[]>('warnings') ?? [];
  for (const warning of warnings) logger.warn(warning);

  await app.listen(Number(config.get<string>('PORT') ?? 3000));
}
void bootstrap();
