import {IUser} from '@models/user.model';

/**
 * The fields the contract declares for a user. `password` is absent by
 * construction: this list is an allow-list, so a field added to the schema later
 * is not exposed until it is named here.
 */
const USER_FIELDS = ['_id', 'email', 'firstName', 'lastName', 'role', 'city', 'buildings', 'active', 'createdAt', 'lastLogin'] as const;

type TSerializedUser = Pick<IUser, (typeof USER_FIELDS)[number]>;

/**
 * Accepts either a hydrated document or a plain object, because `findOne` returns a
 * document while an aggregation or a projection returns a plain object.
 */
const toPlain = (user: object): Record<string, unknown> => {
  const candidate = user as {toJSON?: () => Record<string, unknown>};
  return typeof candidate.toJSON === 'function' ? candidate.toJSON() : (user as Record<string, unknown>);
};

/**
 * Removes the password hash from a user before it leaves the API.
 *
 * This is an allow-list rather than a delete of `password`, so a new sensitive
 * field is excluded by default. `select: false` on the schema would not be enough:
 * the sign-in path needs the hash to compare against, and a projection would have
 * to be repeated on every query — a serialiser is applied once, at the boundary.
 */
export function serializeUser(user: null | undefined): null;
export function serializeUser(user: object): TSerializedUser;
export function serializeUser(user: object | null | undefined): TSerializedUser | null;
export function serializeUser(user: object | null | undefined): TSerializedUser | null {
  if (!user) {
    return null;
  }
  const plain = toPlain(user);
  const result: Record<string, unknown> = {};
  for (const field of USER_FIELDS) {
    // Optional fields are omitted rather than set to `undefined`, so a JSON
    // response does not carry explicit nulls the contract does not declare.
    if (plain[field] !== undefined) {
      result[field] = plain[field];
    }
  }
  return result as TSerializedUser;
}

export function serializeUsers(users: object[]): TSerializedUser[] {
  return users.map((user) => serializeUser(user));
}
