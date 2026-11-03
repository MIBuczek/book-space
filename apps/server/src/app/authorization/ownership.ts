import {TUserRole, USER_ROLES} from '@models/user.model';

/**
 * The identity a record carries for its creator. Both forms exist because the
 * target schema stores a user reference (`createdBy`), while migrated records
 * carry the legacy e-mail.
 */
type TCreatorRef = string | undefined | null;

/**
 * The acting user, as far as an ownership decision needs to know.
 */
interface IActingUser {
  _id?: string;
  email?: string;
  role?: TUserRole;
}

/**
 * Whether the caller is staff, meaning any authenticated role.
 *
 * A public caller has no user object at all, so the absence of one is the public
 * case. An object carrying no recognised role is also public: the role is the only
 * thing that widens access, so anything else has to fail closed rather than be
 * assumed to be staff.
 */
const isStaff = (user: IActingUser | undefined): boolean =>
  user !== undefined && user.role !== undefined && (USER_ROLES as readonly string[]).includes(user.role);

const normalise = (value: TCreatorRef): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * Reads the acting user's id as a string.
 *
 * `IActingUser._id` is declared a `string`, but the value on the request is a
 * hydrated Mongoose document's `ObjectId`, which is an object. `normalise` reads
 * only strings, so passing the raw id would make `ownsRecord` answer "not owned"
 * for the record's own creator — the check would deny everyone rather than the
 * wrong person. Converting here is what keeps the comparison working against the
 * real request; the integration spec exercises it end to end, where a string-only
 * unit test cannot see the difference.
 */
const actingUserId = (user: IActingUser | undefined): string | undefined =>
  user?._id === undefined ? undefined : String(user._id);

/**
 * Exact identity comparison, replacing the legacy substring check
 * (`record.createdBy.includes(user.email)`), which two ways was wrong: an empty
 * e-mail matched every record, and a prefix matched an unintended address.
 *
 * A missing identity on either side is "not owned", never a match.
 */
const ownsRecord = (createdBy: TCreatorRef, actor: TCreatorRef): boolean => {
  const owner = normalise(createdBy);
  const who = normalise(actor);
  if (owner === '' || who === '') {
    return false;
  }
  return owner === who;
};

/**
 * Whether `user` may modify a booking. An administrator may modify any; every
 * other role may modify only what it created (authorization matrix, note 4).
 *
 * A booking that is `null` or `undefined` is not owned. The caller normally loads
 * the booking first and answers `404` when it is missing, but making the check
 * itself fail closed means a future caller cannot accidentally read ownership off
 * a record that was never found.
 */
const canModifyBooking = (
  user: IActingUser | undefined,
  booking: {createdBy?: TCreatorRef} | null | undefined
): boolean => {
  if (!user || !booking) {
    return false;
  }
  if (user.role === 'ADMIN') {
    return true;
  }
  return ownsRecord(booking.createdBy, actingUserId(user)) || ownsRecord(booking.createdBy, user.email);
};

export {ownsRecord, canModifyBooking, isStaff, actingUserId, IActingUser, TCreatorRef};
