/**
 * The display label for a city, keyed by the value the sample data stores.
 *
 * Cities are **data, not a compiled-in list** (spec.md §9 open question 1, FR-007): a
 * facility's `city` is free text an administrator types, and the city selector a screen offers
 * is the set of distinct `city` values across the facilities (`distinctCities`). This map is
 * *display decoration only* — it exists so the sample facilities, whose `city` values are the
 * legacy slugs, render with their proper Polish spelling instead of `swieta-katarzyna`. It does
 * **not** enumerate the cities a deployment may use and it is not a validation list: a city the
 * map does not name renders verbatim (see `cityLabel`), so an operator is free to add any city.
 *
 * It is deliberately a `Record<string, string>` rather than the closed union it used to be,
 * because a closed union is exactly the compiled-in list the decision removes.
 */
const CITY_LABELS: Record<string, string> = {
  siechnice: 'Siechnice',
  radwanice: 'Radwanice',
  'swieta-katarzyna': 'Święta Katarzyna',
  'zerniki-wroclawskie': 'Żerniki Wrocławskie',
};

/** The label to show for a stored city: the known sample label, or the value as typed. */
const cityLabel = (city: string): string => CITY_LABELS[city] ?? city;

/** The distinct cities present in a facility list, in the order the facilities carry them. */
const distinctCities = (buildings: readonly Pick<IBuilding, 'city'>[]): string[] => [
  ...new Set(buildings.map((building) => building.city)),
];

/** Sizes are `1/1` … `3/4`, as fractions of a hall. */
const SIZES = ['1/1', '1/2', '1/3', '2/3', '1/4', '3/4'] as const;
type TSize = (typeof SIZES)[number];

interface IBuilding {
  _id: string;
  name: string;
  /** Facility key, unique per city. */
  property: string;
  /**
   * The city the facility sits in, as free text (spec.md §9 open question 1, FR-007). It is not
   * a closed union: an administrator adds a city by adding a facility that names it, and the
   * city selectors read the distinct values back (`distinctCities`). It is bounded only by
   * length, at the DTO and the schema.
   */
  city: string;
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

/**
 * The body for creating a facility, mirroring the server's `BuildingDto` (FR-010, T272).
 *
 * `name`, `property`, `city`, `email`, `phone` and `sizes` are required — the server's
 * `BuildingDto` marks them so — and the rest are optional because the schema supplies a
 * default (`lighting`, `toilets`, `employees`) or the contract does (`street`, `zipCode`).
 * `city` is a plain `string`, not a union: cities are data (spec.md §9 open question 1), so
 * the form offers a free-text field and the server bounds the length rather than a value set.
 *
 * The update body is the same shape with every field optional. A `Partial` is safe here: this
 * is a client-side type only, and the server's `UpdateBuildingDto` is the concrete class that
 * the global `ValidationPipe` actually validates.
 */
interface IFacilityRequest {
  name: string;
  property: string;
  city: string;
  email: string;
  phone: string;
  sizes: TSize[];
  street?: string;
  zipCode?: string;
  lighting?: boolean;
  toilets?: boolean;
  employees?: string[];
  active?: boolean;
}

/** The body for updating a facility: every field optional, mirroring `UpdateBuildingDto`. */
type IFacilityUpdateRequest = Partial<IFacilityRequest>;

export {CITY_LABELS, cityLabel, distinctCities, SIZES, TSize, PUBLIC_BUILDING_REDACTIONS, IBuilding, IPublicBuilding};
export type {IFacilityRequest, IFacilityUpdateRequest};
