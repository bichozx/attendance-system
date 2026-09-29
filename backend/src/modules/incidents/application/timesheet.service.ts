import { Injectable } from '@nestjs/common';
import { parseDateOnly } from '../../../shared/domain/date-only';
import { addDays, localToUtc } from '../../../shared/domain/zoned-time';
import { assertRange } from '../../../shared/presentation/date-range';
import { IncidentRepository } from '../domain/incident.repository';
import { buildTimesheet } from '../domain/timesheet';

@Injectable()
export class TimesheetService {
  constructor(private readonly repo: IncidentRepository) {}

  async build(
    companyId: string,
    from: string,
    to: string,
    filter: { employeeId?: string; storeId?: string },
  ) {
    assertRange(from, to);
    const timeZone = await this.repo.companyTimeZone(companyId);
    const data = await this.repo.timesheetData(companyId, {
      from: parseDateOnly(from),
      to: parseDateOnly(to),
      rangeStart: localToUtc(from, '00:00', timeZone),
      rangeEnd: localToUtc(addDays(to, 1), '00:00', timeZone),
      ...filter,
    });
    return {
      from,
      to,
      timeZone,
      rows: buildTimesheet({ ...data, from, to, timeZone }),
    };
  }
}
