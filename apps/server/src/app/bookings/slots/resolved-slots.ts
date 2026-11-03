import {TSingleBookingStatus} from '@models/booked-time.model';

/**
 * The immutability rule for resolved time slots (FR-018).
 *
 * A slot that has been resolved — its `status` is `DONE` or `CANCELED` rather than
 * `INITIAL` — carries settlement data (participants, comments, status) that reporting
 * depends on. The legacy application enforced the rule in the browser only
 * (`BookingTimeForm.deleteBookingTime` refused when `status !== INITIAL` and
 * `handlerDisabled` greyed out the edit button), so a crafted request could alter a
 * settled slot. This module is the server-side rule, free of Nest and Mongoose so its
 * spec can drive it directly.
 *
 * A slot is identified by its `day`, matching the legacy `concatBookingTime`, which
 * merged slot lists with `uniqWith(..., isEqual(a.day.getTime(), b.day.getTime()))`.
 * The client cannot send a subdocument `_id` (the DTO does not declare one and
 * `forbidNonWhitelisted` rejects it), so `day` is the only key available on both sides.
 *
 * The rule is stated over a *replacement*: the request body is the complete desired slot
 * list. Every stored resolved slot must therefore appear in it unchanged. A resolved slot
 * that is absent has been deleted; one that is present but different has been edited.
 * Both are refused. `INITIAL` stored slots may be changed or dropped freely, and new
 * slots may be added.
 *
 * Reverting a resolved slot to `INITIAL` is an edit and is refused with no override.
 * FR-018 makes a resolved slot immutable and names no exception; an "unresolve" flag
 * would be a capability the spec does not describe, and the legacy application offered
 * none either (`deleteBookingTime` refused every non-`INITIAL` status, `DONE` included).
 * If un-resolution is ever wanted it should be a first-class operation with its own
 * audit trail, not a flag on a bulk replacement.
 */

/** A slot, as the rule reads it. `BookedTime` and `BookedTimeDto` are both assignable. */
interface ISlot {
  day: Date;
  startHours: Date;
  endHours: Date;
  status: TSingleBookingStatus;
  participants?: number;
  comments?: string;
}

type TResolvedSlotViolation = 'edited' | 'removed';

interface IResolvedSlotViolation {
  kind: TResolvedSlotViolation;
  /** The day of the resolved slot that was touched, for the log and a precise message. */
  day: Date;
}

/**
 * The messages the UI displays. The `removed` text is the legacy string verbatim
 * (`BookingTimeForm.deleteBookingTime`), because that is what the office staff already
 * recognise; the `edited` text is its parallel. They are Polish because they are shown
 * to the user, unlike the developer-facing English messages on the DTO validators.
 */
const RESOLVED_SLOT_MESSAGES: Record<TResolvedSlotViolation, string> = {
  removed: 'Nie można skasować pola które zostało rozliczone',
  edited: 'Nie można edytować pola które zostało rozliczone',
};

const resolvedSlotMessage = (kind: TResolvedSlotViolation): string => RESOLVED_SLOT_MESSAGES[kind];

const toMillis = (value: Date): number => new Date(value).getTime();

const sameInstant = (one?: Date, other?: Date): boolean =>
  one !== undefined && other !== undefined && toMillis(one) === toMillis(other);

/**
 * `undefined`, `null` and `''` are the same absence for the optional scalar fields, so a
 * client that omits an empty comment is not read as editing the slot. A non-empty value
 * still differs from an absent one, which is what makes clearing a resolved slot's
 * comment an edit.
 */
const normaliseOptional = (value: unknown): unknown =>
  value === undefined || value === null || value === '' ? null : value;

const slotsEqual = (one: ISlot, other: ISlot): boolean =>
  sameInstant(one.day, other.day) &&
  sameInstant(one.startHours, other.startHours) &&
  sameInstant(one.endHours, other.endHours) &&
  one.status === other.status &&
  normaliseOptional(one.participants) === normaliseOptional(other.participants) &&
  normaliseOptional(one.comments) === normaliseOptional(other.comments);

/**
 * The first resolved slot the incoming list edits or removes, or `null` when the
 * replacement leaves every resolved slot intact.
 *
 * The order is the stored order, so the reported violation is deterministic when a
 * request touches more than one resolved slot. `INITIAL` stored slots are skipped before
 * any matching, which is what makes them editable and removable.
 */
const findResolvedSlotViolation = (stored: ISlot[], incoming: ISlot[]): IResolvedSlotViolation | null => {
  for (const storedSlot of stored) {
    if (storedSlot.status === 'INITIAL') {
      continue;
    }
    const match = incoming.find((slot) => sameInstant(slot.day, storedSlot.day));
    if (match === undefined) {
      return {kind: 'removed', day: storedSlot.day};
    }
    if (!slotsEqual(match, storedSlot)) {
      return {kind: 'edited', day: storedSlot.day};
    }
  }
  return null;
};

export {findResolvedSlotViolation, resolvedSlotMessage, slotsEqual};
export type {ISlot, TResolvedSlotViolation, IResolvedSlotViolation};
