import {Controller, Get, Header, Query, UseGuards} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {ReportingService} from '../service/reporting.service';
import {SummaryQueryDto} from '../models/summary-query.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';

/**
 * The Summary feature (FR-027–FR-029).
 *
 * `OFFICE` and `ADMIN` only, matching the legacy `summaryUserRestriction` (`isAdmin ||
 * isOffice`); the class default is the narrower pair and an `EMPLOYEE` is refused on every
 * route.
 */
@Controller('reporting')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('OFFICE', 'ADMIN')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /** Per-client summary grouped by city (FR-027). */
  @Get('summary')
  async getSummary(@Query() query: SummaryQueryDto) {
    return this.reportingService.summary(query);
  }

  /**
   * The CSV export (FR-028, FR-029). A `clientId` exports one client; omitting it exports
   * every client with accepted bookings in range. The response is sent as an attachment so a
   * browser downloads it rather than rendering it, and the filename is fixed rather than
   * derived from the range so a caller cannot inject a path.
   */
  @Get('summary.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="summary.csv"')
  getSummaryCsv(@Query() query: SummaryQueryDto) {
    return this.reportingService.csv(query);
  }
}
