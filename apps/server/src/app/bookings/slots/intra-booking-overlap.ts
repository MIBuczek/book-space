import {slotsConflict, IConflictSlot} from '../conflicts/conflicts';

/**
 * The rule for time slots that overlap *within* a single booking (FR-012, T053).
 *
 * The legacy form checked this in the browser
 * (`checkNewAddedBookingTimeConflicts` in `check-booking-conflicts-function.ts`, driving
 * "Niektóre godziny rezerwacji konfliktują ze sobą"). Conflict detection on the server
 * (T018) covers booking-versus-booking only, so a request for the same facility on the
 * same day at 13:00–15:00 and 14:00–16:00 could be stored as one booking: the calendar
 * would render two overlapping events from a single record, and the per-slot resolution
 * workflow (T021) would have two slots claiming the same hour.
 *
 * The rule is the same overlap predicate the booking-versus-booking check uses, so the
 * two cannot disagree about what "overlap" means. It is deliberately *not* an error: the
 * legacy form raised it as a warning and let the request through, and an intra-booking
 * overlap is a data-quality problem the office resolves, not a double booking against
 * another tenant. `slotsOverlapWithin` therefore answers the question and leaves the
 * decision to the caller — `createBooking` records the overlapping day in the log.
 *
 * Touching intervals (`end === next start`) are not overlaps, matching `slotsConflict`:
 * a morning slot ending at 10:00 and one starting at 10:00 are back-to-back, not
 * conflicting.
 */

/** Whether `slot` overlaps `other` as the conflict predicate defines overlap. */
const slotsOverlap = (slot: IConflictSlot, other: IConflictSlot): boolean => slotsConflict(slot, other);

/**
 * The day of the first slot that overlaps a later slot in the same list, or `null`.
 *
 * Reported as the *later* slot's day so the message and the log name the slot that
 * collided with one already present, which is the one the office would remove. Returns
 * only the first so the caller's log stays one line; the check is a warning, so an
 * exhaustive list is not needed.
 */
const findIntraBookingOverlap = (slots: IConflictSlot[]): Date | null => {
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (slotsOverlap(slots[i], slots[j])) {
        return slots[j].day;
      }
    }
  }
  return null;
};

export {slotsOverlap, findIntraBookingOverlap};
