import {Controller, ForbiddenException, Get, Header, Query, UseGuards} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {ConfigService} from '@nestjs/config';
import {ReportingService} from '../service/reporting.service';
import {SummaryQueryDto} from '../models/summary-query.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';
import {CurrentUser} from '../../authorization/decorators/current-user.decorator';
import {IActingUser} from '../../authorization/ownership';
import {isSummaryDenied, parseDenyList} from '../deny-list';

/**
 * The Summary feature (FR-027–FR-029, FR-006).
 *
 * `OFFICE` and `ADMIN` only, matching the legacy `summaryUserRestriction` (`isAdmin ||
 * isOffice`); the class default is the narrower pair and an `EMPLOYEE` is refused on every
 * route. The deny-list is applied on top: an otherwise-permitted account on the list is
 * refused with `403` on both routes, which is the one place the legacy hardcoded account
 * check is reproduced — but from configuration, so it can change without a deploy.
 *
 * The deny-list is read from `SUMMARY_DENY_LIST` on each request rather than captured at
 * construction. `ConfigService` caches the parsed environment, so this is a map lookup, not a
 * file read; reading it per request keeps a test able to vary the list without rebuilding the
 * module, which a constructor capture would not.
 */
@Controller('reporting')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('OFFICE', 'ADMIN')
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly configService: ConfigService
  ) {}

  /** Per-client summary grouped by city (FR-027). */
  @Get('summary')
  async getSummary(@Query() query: SummaryQueryDto, @CurrentUser() user: IActingUser | undefined) {
    this.assertNotDenied(user);
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
  getSummaryCsv(@Query() query: SummaryQueryDto, @CurrentUser() user: IActingUser | undefined) {
    this.assertNotDenied(user);
    return this.reportingService.csv(query);
  }

  private assertNotDenied(user: IActingUser | undefined): void {
    const denyList = parseDenyList(this.configService.get<string>('SUMMARY_DENY_LIST'));
    if (isSummaryDenied(user?.email, denyList)) {
      throw new ForbiddenException('This account is not permitted to use the summary feature');
    }
  }
}
