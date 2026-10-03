import { Injectable } from '@nestjs/common';
import { PageRequest, toPage } from '../../../shared/application/page';
import { addDays, localToUtc } from '../../../shared/domain/zoned-time';
import { assertRange } from '../../../shared/presentation/date-range';
import { ReportsRepository } from '../domain/reports.repository';

@Injectable()
export class AuditQueryService {
  constructor(private readonly repo: ReportsRepository) {}

  async list(
    companyId: string,
    q: {
      from?: string;
      to?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
    },
    page: PageRequest,
  ) {
    let from: Date | undefined;
    let to: Date | undefined;
    if (q.from || q.to) {
      const { timezone } = await this.repo.company(companyId);
      if (q.from && q.to) assertRange(q.from, q.to);
      from = q.from ? localToUtc(q.from, '00:00', timezone) : undefined;
      to = q.to ? localToUtc(addDays(q.to, 1), '00:00', timezone) : undefined;
    }
    const { items, total } = await this.repo.audit(
      companyId,
      { ...q, from, to },
      page,
    );
    return toPage(items, total, page);
  }
}
