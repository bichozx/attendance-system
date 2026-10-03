import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { EmployeeImportService } from '../application/employee-import.service';
import {
  ImportFileError,
  MAX_FILE_BYTES,
} from '../infrastructure/import/spreadsheet.io';
import {
  ImportPreviewDto,
  ImportQueryDto,
  ImportResultDto,
  TemplateQueryDto,
} from './dto/import.dto';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FILE_BODY = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};
const upload = () =>
  FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

type Multer =
  { buffer: Buffer; originalname: string; size: number } | undefined;

function requireFile(file: Multer) {
  if (!file) throw new ImportFileError('Adjunte el archivo en el campo "file"');
  return file;
}

function actorOf(user: AuthenticatedUser) {
  if (!user.companyId)
    throw new ImportFileError('Se requiere una empresa activa');
  return {
    companyId: user.companyId,
    userId: user.userId,
    permissions: user.permissions,
  };
}

@ApiTags('Empleados: importación')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('employees/import')
export class EmployeeImportController {
  constructor(private readonly imports: EmployeeImportService) {}

  @Get('template')
  @RequirePermissions('employees.manage')
  @ApiOperation({
    summary: 'Descargar la plantilla',
    description:
      'Excel con la hoja de datos, instrucciones, cargos y establecimientos existentes. También en CSV.',
  })
  @ApiProduces(XLSX, 'text/csv')
  async template(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TemplateQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = q.format ?? 'xlsx';
    const content = await this.imports.template(
      actorOf(user).companyId,
      format,
    );
    res.set({
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : XLSX,
      'Content-Disposition': `attachment; filename="plantilla_empleados.${format}"`,
    });
    return new StreamableFile(content);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('employees.manage')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({ summary: 'Validar el archivo (no guarda nada)' })
  @ApiOkResponse({ type: ImportPreviewDto })
  @ApiErrors({ 400: 'IMPORT_FILE_INVALID' })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Multer,
  ) {
    return this.imports.preview(actorOf(user).companyId, requireFile(file));
  }

  @Post('preview/report')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('employees.manage')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({
    summary: 'Descargar el reporte de errores',
    description:
      'El mismo archivo con una columna "errores" y las celdas con problemas resaltadas.',
  })
  @ApiProduces(XLSX)
  @ApiErrors({ 400: 'IMPORT_FILE_INVALID' })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Multer,
    @Res({ passthrough: true }) res: Response,
  ) {
    const content = await this.imports.errorReport(
      actorOf(user).companyId,
      requireFile(file),
    );
    res.set({
      'Content-Type': XLSX,
      'Content-Disposition': 'attachment; filename="revision_empleados.xlsx"',
    });
    return new StreamableFile(content);
  }

  @Post()
  @RequirePermissions('employees.manage')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({
    summary: 'Importar',
    description:
      'Todo o nada por defecto: si hay una fila con errores no se guarda ninguna. Con ' +
      '`skipInvalid=true` se importan solo las válidas. acceso_app = SI requiere users.manage.',
  })
  @ApiOkResponse({ type: ImportResultDto })
  @ApiErrors({
    400: 'IMPORT_FILE_INVALID | IMPORT_HAS_ERRORS',
    403: 'IMPORT_ACCESS_FORBIDDEN | IMPORT_CONTRACTS_FORBIDDEN',
  })
  run(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Multer,
    @Query() q: ImportQueryDto,
  ) {
    return this.imports.import(
      actorOf(user),
      requireFile(file),
      q.skipInvalid ?? false,
    );
  }
}
