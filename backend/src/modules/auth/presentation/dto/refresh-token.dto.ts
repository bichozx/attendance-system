import { IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  /** Refresh token recibido en el login o en el último refresh. */
  @IsString()
  @MaxLength(256)
  refreshToken: string;
}
