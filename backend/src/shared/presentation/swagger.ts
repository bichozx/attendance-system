import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Nombre del esquema de seguridad; úsalo en @ApiBearerAuth(BEARER_AUTH). */
export const BEARER_AUTH = 'access-token';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Control de Asistencia y Turnos — API')
    .setDescription(
      'API REST multi-tenant. Obtén un access token en POST /auth/login y ' +
        'pulsa "Authorize" para usarlo en los endpoints protegidos.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token de /auth/login o /auth/refresh',
      },
      BEARER_AUTH,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json', // Para generar clientes tipados (web y móvil)
    swaggerOptions: { persistAuthorization: true },
  });
}
