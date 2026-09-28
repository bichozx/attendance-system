// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   await app.listen(process.env.PORT ?? 3000);
// }
// void bootstrap();

import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { setupSwagger } from './shared/presentation/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(','),
    credentials: true,
  });
  // Número de proxies delante de la app en producción (0 en local)
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  // Swagger activo fuera de producción, salvo que SWAGGER_ENABLED diga lo contrario
  const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
