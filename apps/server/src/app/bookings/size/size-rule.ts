/**
 * The booking-size rule (FR-031, T052).
 *
 * A booking's `size` is the rented fraction of a facility, and the facility declares
 * which fractions it offers (`Building.sizes`). The legacy UI limited the dropdown to
 * those options and nothing checked the value on the server, so a crafted
 * `POST /api/bookings` could store `3/4` on a facility that only rents `1/1` — an
 * impossible rented area in the calendar, the summary and the reports.
 *
 * The rule is *conditional on the facility being resolvable*. A booking whose
 * `place.place` does not match a stored facility is not refused here: "must the
 * facility exist?" is a referential-integrity question owned by T059 (#126), and
 * answering it here would reject legacy-shaped data and every fixture that uses a
 * placeholder facility name. This module answers exactly one question — given a
 * facility, is the size one it offers? — and the caller supplies the facility.
 */

/** The message a rejected size carries; the UI shows it against the `size` field. */
export const SIZE_NOT_OFFERED_MESSAGE = 'The selected size is not offered by this facility.';

/** The part of a facility this rule reads. */
export interface IFacilitySizes {
  sizes: readonly string[];
}

/**
 * Whether `size` is one the facility offers.
 *
 * A missing facility answers `true`, so the caller can pass the result of a lookup that
 * found nothing without a second branch. That is deliberate rather than fail-open: the
 * question "does the facility exist?" is not this rule's, and answering `false` here
 * would turn a missing facility into a size error and hide the real one.
 */
export function isSizeOffered(size: string, facility: IFacilitySizes | null | undefined): boolean {
  if (!facility) {
    return true;
  }
  return facility.sizes.includes(size);
}
