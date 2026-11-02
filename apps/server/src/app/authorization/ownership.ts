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
 */
const canModifyBooking = (user: IActingUser | undefined, booking: {createdBy?: TCreatorRef}): boolean => {
  if (!user) {
    return false;
  }
  if (user.role === 'ADMIN') {
    return true;
  }
  return ownsRecord(booking.createdBy, user._id) || ownsRecord(booking.createdBy, user.email);
};

export {ownsRecord, canModifyBooking, isStaff, IActingUser, TCreatorRef};
