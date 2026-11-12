/**
 * The archived-booking retention rule (T060, spec.md §9 open question 7).
 *
 * The question "what is the retention policy for archived bookings?" had no answer, so nothing
 * ever removed a booking. A booking is kept while it is operationally live (`archive: false`);
 * once archived it is a historical record with a defined shelf life, and the retention window
 * is measured from the **last day the booking occupies a slot** — not from `modifiedAt`.
 *
 * `modifiedAt` is deliberately not the anchor. It is stamped by *every* write path (approval,
 * slot replacement, archive — FR-016), so a booking archived in 2020 and re-saved in 2024 would
 * have its clock reset by an unrelated edit and outlive its window. The last slot day is
 * immutable once the booking is done and is the point the record stopped having operational
 * meaning, which is what a retention period is counted from.
 *
 * The rule is pure and takes `now` as a parameter so a test can pin the boundary without a
 * clock. `retention.ts` owns the decision; the tool never deletes a document the predicate did
 * not accept, even when a database filter matched it first.
 */

/**
 * The default retention window, in months, after the booking's last slot day.
 *
 * Eleven months is a full annual reporting cycle plus a month of overlap: long enough to answer
 * a dispute across the whole period a report can cover, and no longer than the tenant keeps any
 * other record. The window is a default, not a constant — `--retention-months` overrides it and
 * the operations runbook names the value in force.
 *
 * The window is expressed in months, not years, because eleven months is not a whole number of
 * years: a year-based subtraction cannot represent it (open question 7 revision, #198).
 */
const DEFAULT_RETENTION_MONTHS = 11;

/**
 * The instant before which a booking's last slot must fall for the record to be purgeable.
 *
 * Subtracting whole months is done on the calendar (`setMonth`), not by milliseconds: a month is
 * not a fixed number of days, so an arithmetic subtraction would drift and move the boundary.
 * The cutoff is compared as an instant, matching how `bookedTimes[].day` is stored.
 *
 * The one case a calendar subtraction does not have an answer for is a month with no matching
 * day, and JavaScript rolls it forward: 31 Jan minus one month is 3 Mar in a non-leap year (there
 * is no 31 Feb), just as 29 Feb minus a whole number of years rolls to 1 Mar. The boundary check
 * is strict (`<`) so a booking whose last slot sits exactly on the cutoff is kept, which is the
 * safe direction: a record kept a moment past its window is recoverable, a record deleted a
 * moment early is not.
 */
const retentionCutoff = (now: Date, months: number): Date => {
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
};

/** The slice of a booking the retention rule reads. */
interface IRetentionCandidate {
  archive?: boolean;
  bookedTimes?: Array<{day?: Date | string}>;
}

/** The latest slot day in a booking, or `null` when it carries no slots. */
const lastSlotDay = (booking: IRetentionCandidate): Date | null => {
  const days = (booking.bookedTimes ?? [])
    .map((slot) => slot.day)
    .filter((day): day is Date | string => day !== undefined && day !== null)
    .map((day) => (day instanceof Date ? day : new Date(day)))
    .filter((day) => !Number.isNaN(day.getTime()));
  if (days.length === 0) {
    return null;
  }
  return new Date(Math.max(...days.map((day) => day.getTime())));
};

/**
 * Whether a booking may be purged.
 *
 * Both conditions are required: the booking is archived (an active booking is never purged, no
 * matter how old) and its last slot is strictly before the cutoff. A booking with no slots is
 * **not** purgeable — the anchor cannot be computed, and deleting a record on the strength of a
 * missing field is the kind of silent data loss this policy exists to prevent.
 *
 * The boundary is strict (`<`), so a booking whose last slot is exactly the cutoff instant is
 * kept. Retaining one extra instant is the safe direction: a record kept past its window is
 * recoverable, a record deleted a moment early is not.
 */
const isPurgeable = (
  booking: IRetentionCandidate,
  cutoff: Date
): boolean => {
  if (booking.archive !== true) {
    return false;
  }
  const last = lastSlotDay(booking);
  if (last === null) {
    return false;
  }
  return last.getTime() < cutoff.getTime();
};

/**
 * The database filter that narrows the candidate set before the predicate runs.
 *
 * It is an optimisation, not the decision: the tool re-checks every candidate with
 * `isPurgeable`, so a filter that is subtly wrong can only make the tool read more documents,
 * never delete one the rule rejects. `bookedTimes.0` is required so a document with an empty
 * slot array (which `$not`/`$elemMatch` alone would match, since no element is on/after the
 * cutoff) is left for the predicate to refuse.
 */
const purgeFilter = (cutoff: Date): Record<string, unknown> => ({
  archive: true,
  'bookedTimes.0': {$exists: true},
  bookedTimes: {$not: {$elemMatch: {day: {$gte: cutoff}}}},
});

export {retentionCutoff, lastSlotDay, isPurgeable, purgeFilter, DEFAULT_RETENTION_MONTHS};
export type {IRetentionCandidate};
