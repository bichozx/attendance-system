import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { parseDateOnly } from '../../../shared/domain/date-only';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { EmployeesService } from '../application/employees.service';
import { ChangeEmployeeStatusUseCase } from '../application/use-cases/change-employee-status.use-case';
import { GrantEmployeeAccessUseCase } from '../application/use-cases/grant-employee-access.use-case';
import {
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  EmployeeResponseDto,
  GrantAccessDto,
  GrantAccessResponseDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeePresenter } from './employee.presenter';

@ApiTags('Empleados')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly changeStatus: ChangeEmployeeStatusUseCase,
    private readonly grantAccess: GrantEmployeeAccessUseCase,
  ) {}

  @Get()
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Listar empleados con filtros y paginación' })
  @ApiPaginatedResponse(EmployeeResponseDto)
  @ApiErrors(400)
  async list(
    @CurrentCompanyId() companyId: string,
    @Query() query: ListEmployeesQueryDto,
  ) {
    const page = await this.employees.list(
      companyId,
      {
        search: query.search,
        status: query.status,
        positionId: query.positionId,
        storeId: query.storeId,
      },
      query.toPageRequest(),
    );
    return EmployeePresenter.toPage(page);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Detalle de un empleado' })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiErrors(400, { 404: 'EMPLOYEE_NOT_FOUND' })
  async get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return EmployeePresenter.toResponse(
      await this.employees.get(companyId, id),
    );
  }

  @Post()
  @RequirePermissions('employees.manage')
  @ApiOperation({ summary: 'Registrar un empleado' })
  @ApiCreatedResponse({ type: EmployeeResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_EMPLOYEE_DATES | INVALID_REFERENCE' },
    { 409: 'EMPLOYEE_CODE_TAKEN | EMPLOYEE_DOCUMENT_TAKEN' },
  )
  async create(@CurrentActor() actor: Actor, @Body() dto: CreateEmployeeDto) {
    const employee = await this.employees.create(
      actor,
      EmployeePresenter.toData(dto),
    );
    return EmployeePresenter.toResponse(employee);
  }

  @Patch(':id')
  @RequirePermissions('employees.manage')
  @ApiOperation({ summary: 'Editar datos de un empleado' })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_EMPLOYEE_DATES | INVALID_REFERENCE' },
    {
      404: 'EMPLOYEE_NOT_FOUND',
      409: 'EMPLOYEE_CODE_TAKEN | EMPLOYEE_DOCUMENT_TAKEN',
    },
  )
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const employee = await this.employees.update(
      actor,
      id,
      EmployeePresenter.toChanges(dto),
    );
    return EmployeePresenter.toResponse(employee);
  }

  @Patch(':id/status')
  @RequirePermissions('employees.manage')
  @ApiOperation({
    summary: 'Cambiar estado (activo, licencia, inactivo, retiro, reintegro)',
    description:
      'INACTIVE y TERMINATED desactivan su acceso a la app y cierran sus sesiones. ' +
      'Volver a ACTIVE reactiva el acceso.',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_EMPLOYEE_DATES' },
    { 404: 'EMPLOYEE_NOT_FOUND', 409: 'INVALID_STATUS_TRANSITION' },
  )
  async setStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEmployeeStatusDto,
  ) {
    const employee = await this.changeStatus.execute(actor, id, {
      status: dto.status,
      terminationDate: dto.terminationDate
        ? parseDateOnly(dto.terminationDate)
        : undefined,
      rehireDate: dto.rehireDate ? parseDateOnly(dto.rehireDate) : undefined,
    });
    return EmployeePresenter.toResponse(employee);
  }

  @Post(':id/access')
  @RequirePermissions('employees.manage', 'users.manage')
  @ApiOperation({
    summary: 'Dar acceso a la app móvil',
    description:
      'Crea la cuenta (o reutiliza la existente si el correo ya tiene una) y la vincula al empleado. ' +
      'Sin contraseña se envía una invitación por correo; con contraseña, queda como clave temporal.',
  })
  @ApiCreatedResponse({ type: GrantAccessResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | EMAIL_REQUIRED | PASSWORD_REQUIRED' },
    {
      404: 'EMPLOYEE_NOT_FOUND | ROLE_NOT_FOUND',
      409: 'EMPLOYEE_ALREADY_HAS_ACCESS | EMPLOYEE_NOT_ACTIVE | USER_ALREADY_LINKED',
    },
  )
  async access(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantAccessDto,
  ) {
    const result = await this.grantAccess.execute(actor, id, dto);
    return {
      employee: EmployeePresenter.toResponse(result.employee),
      existingAccount: result.existingAccount,
      invited: result.invited,
    };
  }
}
