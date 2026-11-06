import {PUBLIC_BUILDING_REDACTIONS} from '@models/building.model';

/**
 * The fields a facility response can carry, so the serialiser's return type names them
 * rather than being a bare record. A type rather than an array: nothing reads it at
 * runtime, and a value that exists only to be `typeof`-ed can drift out of step with the
 * code that would have used it.
 */
type TBuildingField =
  | '_id'
  | 'name'
  | 'property'
  | 'city'
  | 'sizes'
  | 'lighting'
  | 'toilets'
  | 'email'
  | 'phone'
  | 'street'
  | 'zipCode'
  | 'employees';

type TSerializedBuilding = Partial<Record<TBuildingField, unknown>>;

const toPlain = (building: object): Record<string, unknown> => {
  const candidate = building as {toJSON?: () => Record<string, unknown>};
  return typeof candidate.toJSON === 'function'
    ? candidate.toJSON()
    : (building as Record<string, unknown>);
};

/**
 * Removes the staff-only fields from a facility before it leaves the API to a public
 * caller (FR-007, FR-009).
 *
 * The public calendar and booking form need the facility list to populate the city and
 * facility selectors and to offer the rentable sizes, but the contact details and the
 * employee list belong to the Facilities tab, which is staff-only. `GET /buildings` is one
 * route at two levels of detail — the same shape `GET /bookings` uses — so the difference
 * is a delete of a fixed list rather than a second endpoint that could forget it.
 *
 * The list is `PUBLIC_BUILDING_REDACTIONS` from `libs/models`, the single place the policy
 * is written down; the spec asserts each name individually, because a redaction list that
 * is wrong is a disclosure and a count assertion would not catch a missing name.
 */
export function serializePublicBuilding<T extends object>(building: T): TSerializedBuilding;
export function serializePublicBuilding(building: null | undefined): null;
export function serializePublicBuilding<T extends object>(
  building: T | null | undefined
): TSerializedBuilding | null {
  if (!building) {
    return null;
  }
  const plain = {...toPlain(building)};
  for (const field of PUBLIC_BUILDING_REDACTIONS) {
    delete plain[field];
  }
  return plain as TSerializedBuilding;
}

export function serializePublicBuildings(buildings: object[]): TSerializedBuilding[] {
  return buildings.map((building) => serializePublicBuilding(building));
}
