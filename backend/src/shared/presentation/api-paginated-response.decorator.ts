import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';

// Anotaciones explícitas: el plugin de Swagger documenta solo las clases de archivos *.dto.ts
export class PageMetaDto {
  @ApiProperty({ example: 57 })
  total: number;
  @ApiProperty({ example: 1 })
  page: number;
  @ApiProperty({ example: 20 })
  pageSize: number;
  @ApiProperty({ example: 3 })
  totalPages: number;
}

/** Documenta una respuesta paginada: { items: T[], total, page, pageSize, totalPages }. */
export function ApiPaginatedResponse<T extends Type<unknown>>(model: T) {
  return applyDecorators(
    ApiExtraModels(PageMetaDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PageMetaDto) },
          {
            properties: {
              items: { type: 'array', items: { $ref: getSchemaPath(model) } },
            },
            required: ['items'],
          },
        ],
      },
    }),
  );
}
