import {facilityWallClock, instantFromLegacyLocal, startOfFacilityDay} from '@booking/date-time';
import {Types} from 'mongoose';
import {TClientType, TPayment, IPlace} from '@models/booking.model';
import {TSingleBookingStatus} from '@models/booked-time.model';

import {DEFAULT_CREATED_BY, DEFAULT_DISCOUNT, DEFAULT_MODIFIED_BY, DEFAULT_NICK} from './defaults';
import {objectIdFromLegacyId} from './identity';
import {
  ILegacyBooking,
  ILegacyBookingTime,
  ILegacyBuilding,
  ILegacyClient,
  ILegacySelectedOption,
  ILegacyUser,
} from './legacy';

/**
 * The pure transforms from a legacy Firebase record to a target MongoDB document
 * (research.md R10).
 *
 * Every function here is pure: no I/O, no clock, no randomness. That is what lets T042 assert
 * one behaviour per documented transformation, and it is why the password (which needs a
 * `bcrypt` salt) is *not* produced here — the runner hashes it at write time, and the user
 * transform returns everything else.
 *
 * The one transformation that is not a rename is time. Every legacy slot time is a local
 * wall-clock string, so it is reinterpreted through `instantFromLegacyLocal` rather than
 * parsed with `new Date(value)`: parsing it as UTC would move each slot by one or two hours,
 * and by a different amount either side of a DST transition (research.md R4, T055). The
 * audit stamps are the exception — the legacy write path produced them with
 * `new Date().toISOString()`, so they *are* instants and are parsed as such.
 */

/** The client type the legacy form wrote (`form-const.ts` `CLIENT_TYPE`). */
const LEGACY_INDIVIDUAL = 'Indywidualny';
const LEGACY_COMPANY = 'Firma';

/**
 * `type` is stored upper-case in the target and validated against `INDIVIDUAL | COMPANY`.
 *
 * The legacy values are Polish display labels (`Indywidualny` / `Firma`), and the legacy
 * *booking* form hard-coded `type: CLIENT_TYPE.CLIENT`, so a booking's type is not a
 * reliable field to begin with. The mapping is explicit rather than a case flip, because
 * upper-casing `Indywidualny` yields `INDYWIDUALNY`, which is not a member of the enum.
 */
const toClientType = (legacyType: string | undefined): TClientType => {
  if (legacyType === LEGACY_COMPANY) {
    return 'COMPANY';
  }
  if (legacyType === LEGACY_INDIVIDUAL) {
    return 'INDIVIDUAL';
  }
  // A record that already carries the target spelling (a partially migrated export) is kept.
  const upper = (legacyType ?? '').toUpperCase();
  if (upper === 'COMPANY' || upper === 'INDIVIDUAL') {
    return upper;
  }
  // The legacy booking form always wrote the individual label, so an unrecognised value is
  // treated as an individual rather than refused: refusing would drop a real booking over a
  // field the legacy form did not let the user choose.
  return 'INDIVIDUAL';
};

/**
 * The legacy payment values are lower-case and one of them (`invoice`) is not a target
 * member; the legacy *read* mapper rewrote it to `transfer` (`changePaymentMethod`), and the
 * migration applies the same mapping so the stored value matches what the old UI displayed.
 */
const toPayment = (legacyPayment: string | undefined): TPayment => {
  const normalised = (legacyPayment ?? '').toLowerCase();
  if (normalised === 'invoice') {
    return 'TRANSFER';
  }
  if (normalised === 'cash') {
    return 'CASH';
  }
  if (normalised === 'free') {
    return 'FREE';
  }
  if (normalised === 'transfer') {
    return 'TRANSFER';
  }
  // An absent or unrecognised payment defaults to `transfer`, the legacy form's initial
  // value (`BOOKING_INITIAL_VALUE.payment`), rather than dropping the booking.
  return 'TRANSFER';
};

/**
 * The legacy slot status is `INITIAL | DONE | QUIT`; the target replaces `QUIT` with
 * `CANCELED` (data-model.md, CHK014). The other two are unchanged.
 */
const toStatus = (legacyStatus: string | undefined): TSingleBookingStatus => {
  if (legacyStatus === 'DONE') {
    return 'DONE';
  }
  if (legacyStatus === 'QUIT' || legacyStatus === 'CANCELED') {
    return 'CANCELED';
  }
  return 'INITIAL';
};

/**
 * The legacy UI collected the participant count as a *string*, so the export carries `'12'`
 * or `''`. The target stores a number (data-model.md `participants`), and the schema's
 * `validate` rejects a non-integer, so a non-numeric or absent value becomes `undefined`
 * rather than `NaN` — an unset optional field, which the schema and the DTO both allow.
 */
const toParticipants = (legacyParticipants: string | number | undefined): number | undefined => {
  if (legacyParticipants === undefined || legacyParticipants === '') {
    return undefined;
  }
  const value = typeof legacyParticipants === 'number' ? legacyParticipants : Number(legacyParticipants);
  return Number.isFinite(value) ? value : undefined;
};

/** Reinterprets a legacy local wall-clock value as a facility-local instant (R4, T055). */
const toInstant = (legacyLocal: string): Date => instantFromLegacyLocal(legacyLocal);

/** A legacy slot time as the target `bookedTimes[]` entry. */
interface ITransformedBookedTime {
  day: Date;
  startHours: Date;
  endHours: Date;
  status: TSingleBookingStatus;
  participants?: number;
  comments?: string;
}

const transformBookedTime = (slot: ILegacyBookingTime): ITransformedBookedTime => {
  const startHours = toInstant(slot.startHour);
  const endHours = toInstant(slot.endHour);
  // `day` is the start of the facility-local day. The legacy anchor (`T00:01:00.000Z`) is an
  // artifact of how the legacy app built the string, not a time of day, so it is discarded and
  // the day is normalised to local midnight — the value conflict detection compares.
  const day = startOfFacilityDay(toInstant(slot.day));

  return {
    day,
    startHours,
    endHours,
    status: toStatus(slot.status),
    participants: toParticipants(slot.participants),
    comments: slot.comments,
  };
};

const transformSelectedOption = (option: ILegacySelectedOption) => ({
  options: option.options,
  fromHour: toInstant(option.fromHour),
  toHour: toInstant(option.toHour),
});

/**
 * The legacy denormalised `city` + `building` pair becomes the target `place` object. The
 * facility `property` key is carried through verbatim: the seed's keys are the legacy keys,
 * including the `kort_1`/`kort_2` spellings that use an underscore where the others use a
 * hyphen, so a "normalisation" would move the reference off the facility it names.
 */
const toPlace = (city: string | undefined, building: string | undefined): IPlace => ({
  place: building ?? '',
  city: city ?? '',
});

/**
 * The legacy month index (0–11) is a scalar derived from the booking's **first** slot. It is
 * recomputed from the transformed slots rather than copied, so the stored hint and the slots it
 * summarises cannot disagree; the value is wrong for a booking whose slots straddle a month
 * boundary, which is exactly why nothing reads it (T054).
 *
 * It is read in the facility's civil calendar, not off the instant. `day` is local midnight as a
 * UTC instant, so a June slot's midnight is 22:00Z on 31 May and `getUTCMonth()` would answer 4
 * (May); `facilityWallClock` is what makes the month the local one.
 */
const monthFromSlots = (slots: ITransformedBookedTime[]): number =>
  slots.length === 0 ? 0 : facilityWallClock(slots[0].day).month - 1;

/** A legacy booking as a target `bookings` document, `_id` and all. */
interface ITransformedBooking {
  _id: Types.ObjectId;
  type: TClientType;
  place: IPlace;
  size: string;
  clientId?: string;
  nick: string;
  personName: string;
  personCompany?: string;
  personEmail: string;
  personPhone: string;
  month: number;
  bookedTimes: ITransformedBookedTime[];
  accepted: boolean;
  archive: boolean;
  rodoAcknowledgement: boolean;
  comments?: string;
  paymentMethod: TPayment;
  discount?: string;
  extraOptions: boolean;
  selectedOptions: ReturnType<typeof transformSelectedOption>[];
  createdBy?: string;
  createdAt?: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
}

const transformBooking = (legacy: ILegacyBooking): ITransformedBooking => {
  const bookedTimes = (legacy.bookingTime ?? []).map(transformBookedTime);
  const selectedOptions = (legacy.selectedOptions ?? []).map(transformSelectedOption);

  return {
    _id: objectIdFromLegacyId(legacy._id),
    type: toClientType(legacy.type),
    place: toPlace(legacy.city, legacy.building),
    size: legacy.size ?? '',
    // The legacy booking carried the client's Firebase id; the target `_id` is derived from
    // the same string, so the reference stays resolvable without a lookup table.
    clientId: legacy.clientId ? String(objectIdFromLegacyId(legacy.clientId)) : undefined,
    nick: legacy.nick && legacy.nick.trim().length > 0 ? legacy.nick : DEFAULT_NICK,
    personName: legacy.person ?? '',
    personCompany: legacy.club,
    personEmail: legacy.email ?? '',
    personPhone: legacy.phone ?? '',
    month: monthFromSlots(bookedTimes),
    bookedTimes,
    accepted: legacy.accepted ?? false,
    archive: legacy.archive ?? false,
    // The legacy application collected the RODO acknowledgement in the browser and never
    // stored it; there is no field to migrate, so the migrated booking records `false` — the
    // honest value for a record whose consent cannot be shown.
    rodoAcknowledgement: false,
    comments: legacy.message,
    paymentMethod: toPayment(legacy.payment),
    discount: legacy.discount && legacy.discount.trim().length > 0 ? legacy.discount : DEFAULT_DISCOUNT,
    // Derived, exactly as the create path derives it: a stored value the caller could
    // contradict would be a second source of truth for the same fact.
    extraOptions: selectedOptions.length > 0,
    selectedOptions,
    createdBy: legacy.createdBy ?? DEFAULT_CREATED_BY,
    createdAt: legacy.createdAt ? new Date(legacy.createdAt) : undefined,
    modifiedBy: legacy.modifiedBy ?? DEFAULT_MODIFIED_BY,
    modifiedAt: legacy.modifiedAt ? new Date(legacy.modifiedAt) : undefined,
  };
};

/** A legacy client as a target `clients` document. */
interface ITransformedClient {
  _id: Types.ObjectId;
  type: TClientType;
  name: string;
  nick?: string;
  contactPerson: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
  nip?: string;
}

const transformClient = (legacy: ILegacyClient): ITransformedClient => ({
  _id: objectIdFromLegacyId(legacy._id),
  type: toClientType(legacy.type),
  name: legacy.name ?? '',
  nick: legacy.nick && legacy.nick.trim().length > 0 ? legacy.nick : undefined,
  contactPerson: legacy.contactPerson ?? '',
  phone: legacy.phone ?? '',
  email: legacy.email ?? '',
  street: legacy.street ?? '',
  city: legacy.city ?? '',
  zipCode: legacy.zipCode ?? '',
  nip: legacy.nip && legacy.nip.trim().length > 0 ? legacy.nip : undefined,
});

/** A legacy facility as a target `buildings` document. */
interface ITransformedBuilding {
  _id: Types.ObjectId;
  name: string;
  property: string;
  city: string;
  sizes: string[];
  lighting: boolean;
  toilets: boolean;
  email: string;
  phone: string;
  employees: string[];
}

const transformBuilding = (legacy: ILegacyBuilding): ITransformedBuilding => ({
  _id: objectIdFromLegacyId(legacy._id),
  name: legacy.name ?? '',
  property: legacy.property ?? '',
  city: legacy.city ?? '',
  // `size` (a single value) becomes `sizes` (a list); the legacy field was already an array.
  sizes: legacy.size ?? [],
  // `extra.lighting` / `extra.toilets` are promoted to top-level booleans.
  lighting: legacy.extra?.lighting ?? false,
  toilets: legacy.extra?.toilets ?? false,
  email: legacy.email ?? '',
  phone: legacy.phone ?? '',
  employees: legacy.employees ?? [],
});

/**
 * A legacy user as a target `users` document, **without** `password`.
 *
 * The password is deliberately absent: hashing needs a `bcrypt` salt, which is neither pure
 * nor deterministic, and the transform is where the documented field mappings live. The
 * runner adds the hash, and sets it only on insert so a second run does not reset a password
 * an administrator has since changed.
 *
 * The legacy user carries a single `name`. The target requires `firstName` and `lastName`
 * separately, so the name is split on its first space: everything before it is the first
 * name and the remainder the last. A single-token name (or none) is given a placeholder
 * surname, because the schema requires both and a migration that dropped the account would
 * lose the only record of who the person was.
 */
const transformUser = (legacy: ILegacyUser): Omit<ITransformedUser, 'password'> => {
  const [firstName, ...rest] = (legacy.name ?? '').trim().split(/\s+/);
  return {
    _id: objectIdFromLegacyId(legacy._id),
    email: (legacy.email ?? '').toLowerCase(),
    firstName: firstName || 'Unknown',
    lastName: rest.join(' ') || 'Unknown',
    role: toRole(legacy),
    city: legacy.city && legacy.city.trim().length > 0 ? legacy.city : undefined,
    buildings: legacy.building ?? [],
    active: true,
  };
};

interface ITransformedUser {
  _id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE';
  city?: string;
  buildings: string[];
  active: boolean;
}

/**
 * The legacy role flags map onto the single target role (data-model.md users).
 *
 * The order is `isAdmin` → `isOffice` → `isEmployee`, matching the legacy precedence
 * (`adminCredentials`, `adminSeeContentCredentials`): an administrator sees everything, and a
 * document carrying several flags resolves to the most privileged one rather than the first
 * that happens to be checked. A document with no flag at all is an `EMPLOYEE`, the
 * least-privileged role, so a missing flag cannot silently grant office or administrator
 * capability.
 */
const toRole = (legacy: ILegacyUser): 'ADMIN' | 'OFFICE' | 'EMPLOYEE' => {
  if (legacy.isAdmin) {
    return 'ADMIN';
  }
  if (legacy.isOffice) {
    return 'OFFICE';
  }
  return 'EMPLOYEE';
};

export {
  transformBooking,
  transformClient,
  transformBuilding,
  transformUser,
  transformBookedTime,
  toClientType,
  toPayment,
  toStatus,
  toParticipants,
  toPlace,
  toRole,
  monthFromSlots,
};
export type {
  ITransformedBooking,
  ITransformedBookedTime,
  ITransformedClient,
  ITransformedBuilding,
  ITransformedUser,
};
