import {IPublicBuilding} from '@models/building.model';
import {IBookingRequest, TClientType, TPayment} from '@models/booking.model';
import {IBookedTime} from '@models/booked-time.model';
import {ISelectedExtraOption} from '@models/selected-extra-option.model';
import {expandBookingTimes, findIntraBookingOverlap, IConflictSlot} from '@booking/rules';
import {atFacilityTime, facilityWallClock, startOfFacilityDay} from '@booking/date-time';

/**
 * The booking request form's pure logic (FR-011, FR-012, FR-013).
 *
 * Everything here is a function over plain values so the rules can be unit-tested without a
 * rendered component — the same shape `calendar-events.ts` gives the calendar. The component
 * holds signals and calls these; it does not re-derive a bound or a validation message.
 *
 * The validation mirrors the server's `BookingDto` (T023) field by field. The server is the
 * authority and answers `422`; the form checks the same rules so the visitor is told before a
 * round trip, and so a request the server would refuse is never sent. The bounds are named
 * here rather than copied from the legacy form, whose bounds were looser than the contract.
 */

/** The server's `BookingDto` bounds, restated where the form can read them. */
const NICK_MIN = 3;
const NICK_MAX = 100;
const PERSON_NAME_MIN = 3;
const PERSON_NAME_MAX = 125;
const PERSON_COMPANY_MAX = 125;
const PERSON_EMAIL_MIN = 3;
const PERSON_EMAIL_MAX = 125;
const PERSON_PHONE_MIN = 9;
const PERSON_PHONE_MAX = 15;
const COMMENTS_MAX = 525;
const DISCOUNT_PATTERN = /^[0-9]{1,3}%$/;
/**
 * A pragmatic e-mail check: something before the `@`, and a dotted domain after it.
 *
 * The server uses `@IsEmail`, which requires a dotted domain by default, so a value this
 * accepts and the server rejects is the case to avoid — `a@b` is refused on both sides. The
 * check is deliberately not the full RFC grammar: a form that guesses wrong turns a valid
 * address into a blocked submission, and the server remains the authority.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The legacy facility-local opening hours: slots run 09:00–24:00. */
const OPENING_HOUR = 9;
const CLOSING_HOUR = 23;
/** The exclusive end of the day, allowed as a slot's end hour (local midnight). */
const END_OF_DAY_HOUR = 24;

/** The Polish labels for the client types, matching the legacy `CLIENT_OPTIONS`. */
const CLIENT_TYPE_LABELS: Record<TClientType, string> = {
  INDIVIDUAL: 'Osoba prywatna',
  COMPANY: 'Firma',
};

/** The Polish labels for the payment methods, matching the legacy `PAYMENTS_OPTIONS`. */
const PAYMENT_LABELS: Record<TPayment, string> = {
  TRANSFER: 'Przelew',
  CASH: 'Gotówka',
  FREE: 'Bezpłatne',
};

/** A form value, before it is turned into a request body. Strings because inputs yield strings. */
interface IBookingFormValue {
  type: TClientType;
  size: string;
  nick: string;
  personName: string;
  personCompany: string;
  personEmail: string;
  personPhone: string;
  comments: string;
  paymentMethod: TPayment;
  /** Optional and administrator-only in the legacy form; a percentage such as `10%`. */
  discount: string;
  rodoAcknowledgement: boolean;
}

/** A slot as the form holds it, before expansion: a local day and an hour range. */
interface ISlotEntry {
  /** Facility-local day the slot starts on. */
  day: Date;
  /** Facility-local start hour, 0–23. */
  startHour: number;
  /** Facility-local end hour, 1–24; `24` is midnight at the end of the day. */
  endHour: number;
}

/** A cyclical series the form holds: the weekly repeat between two local days. */
interface ICyclicalEntry {
  startDay: Date;
  endDay: Date;
  startHour: number;
  endHour: number;
}

/** An add-on the form holds: the flags selected and the hour range they apply to. */
interface IExtraOptionEntry {
  day: Date;
  fromHour: number;
  toHour: number;
  lights: boolean;
  toilets: boolean;
}

/** The field errors the form shows, keyed by the field they belong to. */
type TFieldErrors = Partial<Record<keyof IBookingFormValue | 'slots' | 'facility', string>>;

/** The start-hour options: 09:00 through 23:00. */
const START_HOUR_OPTIONS: number[] = Array.from(
  {length: CLOSING_HOUR - OPENING_HOUR + 1},
  (_, index) => OPENING_HOUR + index
);

/** The end-hour options: 10:00 through 24:00, so a slot always ends after it starts. */
const END_HOUR_OPTIONS: number[] = Array.from(
  {length: END_OF_DAY_HOUR - (OPENING_HOUR + 1) + 1},
  (_, index) => OPENING_HOUR + 1 + index
);

/** The sizes the size selector offers for one facility. */
const sizeOptions = (facility: IPublicBuilding | undefined): string[] => facility?.sizes ?? [];

/**
 * Whether a facility supports the lighting / sanitary add-ons (FR-011).
 *
 * The legacy form offered `BookingExtraOptions` only for `boisko-sztuczna-nawierzchnia`, and
 * the facility record carries the same two flags (`lighting`, `toilets`). Keying on the flags
 * rather than on the property name keeps the form and the seed in step: a facility that gains
 * lighting gains the form, and the add-on a visitor can request is one the facility has.
 */
const supportsExtraOptions = (facility: IPublicBuilding | undefined): boolean =>
  facility?.lighting === true || facility?.toilets === true;

/**
 * The latest local day the picker allows.
 *
 * The legacy `generateMaxRangDate` returned 1 January of the current year — or the next one
 * when the current month was August or later, or the caller was an administrator — and the
 * form added eight months to it. The rule the spec states is what this reproduces: the maximum
 * is the end of the current year, and it moves to the end of the following year once the month
 * reaches August, so the picker never runs out mid-season (spec.md edge case). An administrator
 * is not extended here because the public form has no administrator case; the staff form (T036)
 * owns that difference.
 */
const maxSelectableDay = (now: Date): Date => {
  const {year, month} = facilityWallClock(now);
  const target = month >= 8 ? year + 1 : year;
  return startOfFacilityDay(new Date(Date.UTC(target, 11, 31, 12)));
};

/**
 * The earliest local day the picker allows: today.
 *
 * The legacy form set `minDate = new Date()` for a non-administrator, so a request for a past
 * day could not be chosen. The server does not reject a past day (the legacy office entered
 * historical bookings), so this is a client-side convenience rather than a mirrored rule; it is
 * still the behaviour the acceptance scenario names ("the date picker prevents selecting it").
 */
const minSelectableDay = (now: Date): Date => startOfFacilityDay(now);

/** The instant on `day`'s local date at the given wall-clock hour (delegates to the shared rule). */
const facilityAtHour = (day: Date, hour: number): Date => atFacilityTime(day, hour);

/**
 * Validates the non-slot fields, returning one message per invalid field.
 *
 * The messages name the field and the bound so the visitor can correct it, mirroring the
 * server's own messages where the server has one. `rodoAcknowledgement` is *not* checked here:
 * the submit button is disabled until it is ticked (acceptance scenario 3), and the server
 * enforces it for a public caller, so a message would be a third copy of the rule.
 */
const validateForm = (value: IBookingFormValue): TFieldErrors => {
  const errors: TFieldErrors = {};

  if (value.nick.length < NICK_MIN || value.nick.length > NICK_MAX) {
    errors.nick = `Nazwa musi mieć od ${NICK_MIN} do ${NICK_MAX} znaków`;
  }
  if (value.personName.length < PERSON_NAME_MIN || value.personName.length > PERSON_NAME_MAX) {
    errors.personName = `Imię i nazwisko musi mieć od ${PERSON_NAME_MIN} do ${PERSON_NAME_MAX} znaków`;
  }
  if (value.personCompany.length > PERSON_COMPANY_MAX) {
    errors.personCompany = `Nazwa firmy może mieć maksymalnie ${PERSON_COMPANY_MAX} znaków`;
  }
  if (
    !EMAIL_PATTERN.test(value.personEmail) ||
    value.personEmail.length < PERSON_EMAIL_MIN ||
    value.personEmail.length > PERSON_EMAIL_MAX
  ) {
    errors.personEmail = 'Podaj poprawny adres e-mail';
  }
  if (value.personPhone.length < PERSON_PHONE_MIN || value.personPhone.length > PERSON_PHONE_MAX) {
    errors.personPhone = `Telefon musi mieć od ${PERSON_PHONE_MIN} do ${PERSON_PHONE_MAX} znaków`;
  }
  if (value.comments.length > COMMENTS_MAX) {
    errors.comments = `Uwagi mogą mieć maksymalnie ${COMMENTS_MAX} znaków`;
  }
  if (value.discount !== '' && !DISCOUNT_PATTERN.test(value.discount)) {
    errors.discount = 'Rabat musi być wartością procentową, np. 10%';
  }

  return errors;
};

/**
 * Whether a slot's hour range is valid: the end must be strictly after the start.
 *
 * The legacy form compared `start - end > 50 ms` and refused an end at or before the start;
 * the server's `AfterStartHours` validator and the schema enforce the same thing. The end may
 * be `24`, which is local midnight at the end of the day — a legitimate close for a late slot.
 */
const slotHoursValid = (startHour: number, endHour: number): boolean => endHour > startHour;

/**
 * Builds the request's slots from the entries the form holds.
 *
 * A plain entry expands to one slot; a cyclical entry expands to its weekly series through the
 * shared `expandBookingTimes`, so the client and the server cannot disagree about the off-by-one
 * the issue names. The hours are validated by the caller before this runs; the expansion itself
 * is the shared rule.
 */
const buildSlots = (plain: ISlotEntry[], cyclical: ICyclicalEntry[]): IBookedTime[] => {
  const slots: IBookedTime[] = [];

  for (const entry of plain) {
    slots.push(
      ...expandBookingTimes({
        startDay: entry.day,
        endDay: entry.day,
        startHour: entry.startHour,
        endHour: entry.endHour,
        cyclical: false,
      })
    );
  }

  for (const entry of cyclical) {
    slots.push(
      ...expandBookingTimes({
        startDay: entry.startDay,
        endDay: entry.endDay,
        startHour: entry.startHour,
        endHour: entry.endHour,
        cyclical: true,
      })
    );
  }

  return slots;
};

/**
 * The day of the first slot that overlaps a later one, or `null`.
 *
 * The legacy form showed "Niektóre godziny rezerwacji konfliktują ze sobą" and still allowed
 * the submission; the server records the same case as a warning (T053). Returning the day
 * rather than a boolean lets the form name it, and the check reuses the exact predicate the
 * server uses so the two warnings cannot disagree.
 */
const slotOverlapWarning = (slots: IConflictSlot[]): Date | null => findIntraBookingOverlap(slots);

/**
 * Builds the request's add-ons from the entries the form holds (FR-011).
 *
 * Each entry becomes one `ISelectedExtraOption`, whose `options` is a list of single-key
 * objects — `{lights: true}` and/or `{toilets: true}` — matching the legacy form and the
 * server's `SelectedExtraOptionDto`. An entry that selected neither flag is dropped rather
 * than stored empty: the DTO requires at least one option, so an empty one would be refused
 * at the boundary. The hour range is the visitor's own, not the slot's, matching the legacy
 * form where an add-on carried its own `fromHour`/`toHour`.
 */
const buildExtraOptions = (entries: IExtraOptionEntry[]): ISelectedExtraOption[] =>
  entries
    .map((entry) => {
      const options: ISelectedExtraOption['options'] = [];
      if (entry.lights) {
        options.push({lights: true});
      }
      if (entry.toilets) {
        options.push({toilets: true});
      }
      return {
        options,
        fromHour: facilityAtHour(entry.day, entry.fromHour),
        toHour: facilityAtHour(entry.day, entry.toHour),
      };
    })
    .filter((option) => option.options.length > 0);

/**
 * Turns the form value and its slots into the request body the API expects.
 *
 * `month` is the legacy month index of the first slot, derived rather than entered — the
 * reporting and the migration read it, and the form has no business asking for a value it can
 * compute. `place` pairs the facility key with its city: a facility's identity is
 * `{city, property}` and the same `property` exists in more than one city, so the city must
 * travel with it (spec.md edge case).
 */
const buildRequest = (
  value: IBookingFormValue,
  facility: IPublicBuilding,
  slots: IBookedTime[],
  extraOptions: IExtraOptionEntry[] = []
): IBookingRequest => {
  const {month} = facilityWallClock(slots[0].day);

  const request: IBookingRequest = {
    type: value.type,
    place: {place: facility.property, city: facility.city},
    size: value.size,
    nick: value.nick,
    personName: value.personName,
    personEmail: value.personEmail,
    personPhone: value.personPhone,
    month: month - 1,
    bookedTimes: slots,
    rodoAcknowledgement: value.rodoAcknowledgement,
    paymentMethod: value.paymentMethod,
  };

  if (value.personCompany !== '') {
    request.personCompany = value.personCompany;
  }
  if (value.comments !== '') {
    request.comments = value.comments;
  }
  if (value.discount !== '') {
    request.discount = value.discount;
  }

  const selectedOptions = buildExtraOptions(extraOptions);
  if (selectedOptions.length > 0) {
    request.selectedOptions = selectedOptions;
  }

  return request;
};

export {
  CLIENT_TYPE_LABELS,
  PAYMENT_LABELS,
  NICK_MIN,
  NICK_MAX,
  PERSON_NAME_MIN,
  PERSON_NAME_MAX,
  PERSON_COMPANY_MAX,
  PERSON_EMAIL_MIN,
  PERSON_EMAIL_MAX,
  PERSON_PHONE_MIN,
  PERSON_PHONE_MAX,
  COMMENTS_MAX,
  DISCOUNT_PATTERN,
  EMAIL_PATTERN,
  OPENING_HOUR,
  CLOSING_HOUR,
  END_OF_DAY_HOUR,
  START_HOUR_OPTIONS,
  END_HOUR_OPTIONS,
  sizeOptions,
  supportsExtraOptions,
  maxSelectableDay,
  minSelectableDay,
  facilityAtHour,
  validateForm,
  slotHoursValid,
  buildSlots,
  slotOverlapWarning,
  buildExtraOptions,
  buildRequest,
};
export type {IBookingFormValue, ISlotEntry, ICyclicalEntry, IExtraOptionEntry, TFieldErrors};
