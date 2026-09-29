import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { PageRequest } from '../application/page';

export class PaginationQueryDto {
  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * Máximo 100.
   * @example 20
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  toPageRequest(): PageRequest {
    return { page: this.page ?? 1, pageSize: this.pageSize ?? 20 };
  }
}
