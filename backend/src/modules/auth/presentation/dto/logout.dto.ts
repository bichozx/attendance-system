import { IsBoolean, IsOptional } from 'class-validator';

export class LogoutDto {
  /**
   * true = cerrar sesión en todos los dispositivos.
   * @example false
   */
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
