/**
 * Fields a public caller must never receive, per authorization-matrix note 6 and
 * issue #20.
 *
 * The legacy client showed the calendar label (`nick`) to a public visitor and the
 * tenant's name to staff, but that was a display choice, not a control — the API
 * returned everything. These are personal data or an internal reference, so they are
 * removed at the boundary rather than hidden by the client.
 *
 * `clientId` is here because it points at a client record the public caller cannot
 * read or act on, and because issue #20's acceptance criteria name it alongside the
 * personal fields. The matrix's note 6 lists only the four personal fields; where the
 * two disagree the narrower disclosure wins, so the reference is redacted too.
 */
const PUBLIC_BOOKING_REDACTIONS = ['personName', 'personEmail', 'personPhone', 'comments', 'clientId'] as const;

/**
 * The fields a booking response can carry, so the serialiser's return type names
 * them rather than being a bare record. A type rather than an array: nothing reads
 * it at runtime, and a value that exists only to be `typeof`-ed is a value that can
 * drift out of step with the code that would have used it.
 */
type TBookingField =
  | '_id'
  | 'type'
  | 'place'
  | 'size'
  | 'clientId'
  | 'nick'
  | 'personName'
  | 'personCompany'
  | 'personEmail'
  | 'personPhone'
  | 'month'
  | 'bookedTimes'
  | 'accepted'
  | 'archive'
  | 'comments'
  | 'paymentMethod'
  | 'discount'
  | 'extraOptions'
  | 'selectedOptions'
  | 'conflicts'
  | 'createdBy'
  | 'createdAt'
  | 'modifiedBy'
  | 'modifiedAt';

type TSerializedBooking = Partial<Record<TBookingField, unknown>>;

const toPlain = (booking: object): Record<string, unknown> => {
  const candidate = booking as {toJSON?: () => Record<string, unknown>};
  return typeof candidate.toJSON === 'function' ? candidate.toJSON() : (booking as Record<string, unknown>);
};

/**
 * Removes the personal fields from a booking before it leaves the API to a public
 * caller.
 *
 * This is a delete of a fixed list rather than an allow-list of the fields the
 * public calendar needs, because the two callers differ by *four fields*, not by
 * shape: staff and the public receive the same booking, one with the tenant's
 * details and one without. An allow-list would have to be maintained as the
 * calendar grows and would silently drop a field a staff caller needs. The list is
 * a `const` tuple so `PUBLIC_BOOKING_REDACTIONS` is the single place the policy is
 * written down, and the spec asserts each name individually — a redaction list that
 * is wrong is a data leak, so it is pinned by name rather than by count.
 *
 * `personCompany` is deliberately not removed: it is not in note 6, and it is not
 * personal data in the way the others are.
 */
export function serializePublicBooking<T extends object>(booking: T): TSerializedBooking;
export function serializePublicBooking(booking: null | undefined): null;
export function serializePublicBooking<T extends object>(booking: T | null | undefined): TSerializedBooking | null {
  if (!booking) {
    return null;
  }
  const plain = {...toPlain(booking)};
  for (const field of PUBLIC_BOOKING_REDACTIONS) {
    delete plain[field];
  }
  return plain as TSerializedBooking;
}

export function serializePublicBookings(bookings: object[]): TSerializedBooking[] {
  return bookings.map((booking) => serializePublicBooking(booking));
}

export {PUBLIC_BOOKING_REDACTIONS};
