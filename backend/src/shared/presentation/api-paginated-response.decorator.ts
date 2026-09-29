import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export class PageMetaDto {
  /** @example 57 */
  total: number;
  /** @example 1 */
  page: number;
  /** @example 20 */
  pageSize: number;
  /** @example 3 */
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
