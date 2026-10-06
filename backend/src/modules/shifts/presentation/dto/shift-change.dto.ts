import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const STAGES = [
  'AWAITING_PEER',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'DECLINED_BY_PEER',
  'CANCELLED',
] as const;

export class CreateShiftChangeDto {
  /** COVER: el compañero toma mi turno. SWAP: intercambiamos. @example "COVER" */
  @IsIn(['COVER', 'SWAP'])
  kind: 'COVER' | 'SWAP';

  /** Mi turno (el que entrego). */
  @IsUUID()
  shiftId: string;

  /** El compañero (de GET /me/shift-changes/options). */
  @IsUUID()
  peerEmployeeId: string;

  /** Solo SWAP: el turno del compañero que recibo. */
  @IsOptional()
  @IsUUID()
  peerShiftId?: string;

  /** @example "Tengo cita médica" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RespondShiftChangeDto {
  @IsBoolean()
  accept: boolean;

  /** Comentario opcional para quien pidió el cambio. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class OptionsQueryDto {
  /** Mi turno que quiero ceder o intercambiar. */
  @IsUUID()
  shiftId: string;
}

export class ListShiftChangesQueryDto extends PaginationQueryDto {
  /** AWAITING_APPROVAL = bandeja del supervisor. */
  @IsOptional()
  @IsIn(STAGES)
  stage?: (typeof STAGES)[number];
}

export class ApproveShiftChangeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class RejectShiftChangeDto {
  /** Obligatoria: les llega a ambos empleados. */
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  notes: string;
}

// ---------- Respuestas ----------

export class ChangeShiftDto {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
  /** @example "vie, 16 de oct, 14:00–22:00" */
  description: string;
  /** @example "Tienda Centro" */
  storeName: string;
}

export class ChangePersonDto {
  employeeId: string;
  /** @example "Ana" */
  firstName: string;
  /** @example "Ruiz" */
  lastName: string;
}

export class ShiftChangeResponseDto {
  id: string;
  /** @example "SWAP" */
  kind: string;
  /** @example "AWAITING_APPROVAL" */
  stage: string;
  requester: ChangePersonDto;
  peer: ChangePersonDto;
  /** Turno que entrega quien pide. */
  shift: ChangeShiftDto;
  /** Turno que recibe a cambio (solo SWAP). */
  peerShift: ChangeShiftDto | null;
  reason: string | null;
  /** Nota del supervisor o comentario del compañero al no aceptar. */
  reviewNotes: string | null;
  peerRespondedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  /** Solo en /me: REQUESTER = la pedí yo; PEER = me la piden a mí. */
  myRole?: 'REQUESTER' | 'PEER';
}

export class SwapOptionDto {
  coworker: ChangePersonDto;
  shift: ChangeShiftDto;
}

export class ChangeOptionsResponseDto {
  /** Compañeros que pueden cubrir tu turno. */
  cover: ChangePersonDto[];
  /** Turnos de compañeros que puedes intercambiar por el tuyo (próximos 14 días). */
  swap: SwapOptionDto[];
}
