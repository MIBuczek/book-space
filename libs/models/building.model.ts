/** The four facilities' cities. Stored lower-case. */
const CITIES = ['siechnice', 'radwanice', 'swieta-katarzyna', 'zerniki-wroclawskie'] as const;
type TCity = (typeof CITIES)[number];

/**
 * The display label for each city, as the legacy `CITY_OPTIONS` wrote it.
 *
 * This lives beside `CITIES` because four screens render a city selector — the public
 * calendar, the booking form, the bookings tab and the facilities tab — and a copy per
 * screen is exactly the drift the shared model exists to prevent: a renamed city would
 * appear correctly on one screen and not another, with nothing to catch it. The stored
 * value stays the lower-case key; only the label differs.
 */
const CITY_LABELS: Record<TCity, string> = {
  siechnice: 'Siechnice',
  radwanice: 'Radwanice',
  'swieta-katarzyna': 'Święta Katarzyna',
  'zerniki-wroclawskie': 'Żerniki Wrocławskie',
};

/** Sizes are `1/1` … `3/4`, as fractions of a hall. */
const SIZES = ['1/1', '1/2', '1/3', '2/3', '1/4', '3/4'] as const;
type TSize = (typeof SIZES)[number];

interface IBuilding {
  _id: string;
  name: string;
  /** Facility key, unique per city. */
  property: string;
  city: TCity;
  sizes: TSize[];
  lighting: boolean;
  toilets: boolean;
  email: string;
  phone: string;
  /** Optional: no legacy facility carries an address (spec.md §4, FR-009). */
  street?: string;
  zipCode?: string;
  /**
   * Employee display names for the Facilities tab (FR-009), matching the legacy
   * `building-data-const.ts`. A reference-based model (data-model.md's recommendation) waits
   * for user management (T051): the seed carries names, and a reference would resolve to
   * nothing until the staff users exist. The field stays `string[]`, so switching to ids
   * later is a data migration rather than a contract change.
   */
  employees: string[];
  /**
   * Whether the facility is still in use (T059, FR-010). A hard delete is refused with
   * `409` while a booking or an employee assignment references it, so retiring a facility
   * is a deactivation (`PUT /buildings/{_id} {active: false}`). An inactive facility is
   * withheld from the public `GET /buildings` read (the calendar and booking form), which
   * is the referential-integrity fix: the legacy delete silently orphaned the bookings
   * that referenced it. Absent on a legacy document, which reads as active.
   */
  active?: boolean;
}

/**
 * Fields a public (anonymous) caller must never receive for a facility.
 *
 * The public calendar and booking form need a facility's identity and its rentable
 * sizes (FR-007, FR-012), but not its contact details or the internal employee list —
 * those are the Facilities-tab read (FR-009), which is staff-only. The list is the
 * policy: the server serialiser removes exactly these keys, and the UI's
 * `IPublicBuilding` omits them, so the boundary is written once.
 */
const PUBLIC_BUILDING_REDACTIONS = ['email', 'phone', 'employees', 'street', 'zipCode'] as const;

/** A facility as a public caller receives it: contact details and the employee list removed. */
type IPublicBuilding = Omit<IBuilding, (typeof PUBLIC_BUILDING_REDACTIONS)[number]>;

export {CITIES, TCity, CITY_LABELS, SIZES, TSize, PUBLIC_BUILDING_REDACTIONS, IBuilding, IPublicBuilding};
