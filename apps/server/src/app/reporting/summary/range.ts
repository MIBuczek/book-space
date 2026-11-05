import {endOfFacilityMonth, startOfFacilityMonth} from '../../utility/facility-time';
import {ISummaryRange} from './summary';

/**
 * Resolves the requested month range into inclusive instants, in the facility's calendar.
 *
 * `fromMonth` and `toMonth` are the first instant of a month (the UI sends a month, not a
 * day), and each is widened to its whole month: the report is monthly, so a caller selecting
 * "March" must get 1 March 00:00 through 31 March 23:59:59, matching the legacy
 * `changeDayInDateStart(1)` … `changeDayInDateEnd(numberOfMonthDays)` window.
 *
 * `fromTheBeginning` short-circuits the range: it is the one case that legitimately reads the
 * whole history, and the caller (an office or administrator) is the only one allowed to ask.
 *
 * A range with one bound missing is rejected rather than treated as open-ended — an unbounded
 * read is the exposure FR-043 names. The DTO enforces the same rule at the boundary; this is
 * the defence that survives a caller that bypasses the pipe.
 */
const resolveSummaryRange = (
  fromMonth: Date | undefined,
  toMonth: Date | undefined,
  fromTheBeginning: boolean
): ISummaryRange => {
  if (fromTheBeginning) {
    return {fromTheBeginning: true};
  }

  if (!fromMonth || !toMonth) {
    throw new RangeError('A summary range needs both fromMonth and toMonth, or fromTheBeginning');
  }

  const from = startOfFacilityMonth(fromMonth);
  const to = endOfFacilityMonth(toMonth);

  if (from.getTime() > to.getTime()) {
    throw new RangeError('fromMonth must not be after toMonth');
  }

  return {fromTheBeginning: false, from, to};
};

export {resolveSummaryRange};
