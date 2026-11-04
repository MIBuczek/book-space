/** The four facilities' cities. Stored lower-case. */
const CITIES = ['siechnice', 'radwanice', 'swieta-katarzyna', 'zerniki-wroclawskie'] as const;
type TCity = (typeof CITIES)[number];

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
}

export {CITIES, TCity, SIZES, TSize, IBuilding};
