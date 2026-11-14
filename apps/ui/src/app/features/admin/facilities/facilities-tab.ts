import {HttpErrorResponse} from '@angular/common/http';
import {TranslateFn} from '@booking/i18n';
import {cityLabel, IBuilding, IFacilityRequest, TSize} from '@models/building.model';
import {IMessageRequest} from '@models/notification.model';

/**
 * The admin facilities tab's pure logic (FR-009, FR-041, issue #42).
 *
 * Everything here is a function over plain values so the detail rows, the employee options and
 * the message validation are unit-testable without a rendered screen — the same shape
 * `clients-table.ts` gives the clients tab. The component holds signals and calls these; it
 * does not re-derive a label or decide whether a field is required inline.
 *
 * The legacy `Building.tsx` read the facility from a compiled-in constant and fell back to it
 * when the API had none; that fallback is the defect the task removes. There is no default
 * facility here — an absent one yields no detail rows and no employees, so a screen backed by
 * no data shows nothing rather than stale static data.
 */

/** A labelled line in the facility detail panel. */
interface IDetailRow {
  label: string;
  value: string;
}

/** An employee as the message form's selector offers them. */
interface IEmployeeOption {
  value: string;
  label: string;
}

/**
 * A message form value, before it becomes a request body. Strings because inputs yield
 * strings.
 *
 * `person` is the selected employee's name, `recipient` is the destination address and
 * `message` is the body. The sender's own address (`email` on the request) is the facility's
 * contact address, taken from the record rather than typed, so a reply goes back to the
 * facility the message is about.
 */
interface IEmployeeMessageValue {
  person: string;
  recipient: string;
  message: string;
}

/** The field errors the form shows, keyed by the field they belong to. */
type TEmployeeMessageErrors = Partial<Record<keyof IEmployeeMessageValue, string>>;

/** The server's `BuildingDto`/`UpdateBuildingDto` bounds, restated where the form can read them. */
const NAME_MIN = 3;
const NAME_MAX = 125;
const EMAIL_MIN = 3;
const EMAIL_MAX = 125;
const PHONE_MIN = 3;
const PHONE_MAX = 15;
const CITY_MIN = 2;
const CITY_MAX = 125;
const STREET_MIN = 3;
const STREET_MAX = 125;
const ZIP_LENGTH = 6;
const ZIP_PATTERN = /^[\d./-]+$/;

/**
 * A facility form value, before it becomes a request body.
 *
 * Every field is a string because inputs and textareas yield strings; `sizes` is the one
 * structured field (a list of fractions, chosen with a checkbox per size), and `employees` is
 * edited as one name per line so the operator does not have to learn a list syntax.
 */
interface IFacilityFormValue {
  name: string;
  property: string;
  city: string;
  email: string;
  phone: string;
  street: string;
  zipCode: string;
  sizes: TSize[];
  lighting: boolean;
  toilets: boolean;
  employees: string;
  active: boolean;
}

/** The field errors the facility form shows, keyed by the field they belong to. */
type TFacilityFieldErrors = Partial<Record<keyof IFacilityFormValue, string>>;

/** The errors a failed facility write produced: the per-field map and any message matching no field. */
interface IFacilityWriteErrors {
  fields: TFacilityFieldErrors;
  general: string | null;
}

/** An empty facility form. `active` defaults to true, matching the schema. */
const emptyFacilityForm = (): IFacilityFormValue => ({
  name: '',
  property: '',
  city: '',
  email: '',
  phone: '',
  street: '',
  zipCode: '',
  sizes: [],
  lighting: false,
  toilets: false,
  employees: '',
  active: true,
});

/** The form value for an existing facility, so an edit starts from what is stored. */
const formFromFacility = (facility: IBuilding): IFacilityFormValue => ({
  name: facility.name,
  property: facility.property,
  city: facility.city,
  email: facility.email,
  phone: facility.phone,
  street: facility.street ?? '',
  zipCode: facility.zipCode ?? '',
  sizes: [...facility.sizes],
  lighting: facility.lighting,
  toilets: facility.toilets,
  employees: facility.employees.join('\n'),
  // Absent on a legacy record, which reads as active (T059).
  active: facility.active !== false,
});

/**
 * Validates the form, returning one message per invalid field.
 *
 * The rules mirror the server's `BuildingDto` field by field. The server is the authority and
 * answers `422`; the form checks the same rules so an obviously invalid facility never makes a
 * round trip. `sizes` needs at least one entry, because a facility with no rentable size cannot
 * be booked — the same rule the schema's non-empty validator enforces.
 */
const validateFacilityForm = (value: IFacilityFormValue, t: TranslateFn): TFacilityFieldErrors => {
  const errors: TFacilityFieldErrors = {};

  if (value.name.length < NAME_MIN || value.name.length > NAME_MAX) {
    errors.name = t('validation.nameRange', {min: NAME_MIN, max: NAME_MAX});
  }
  if (value.property.trim() === '') {
    errors.property = t('validation.propertyRequired');
  }
  if (value.email === '') {
    errors.email = t('validation.emailRequired');
  } else if (
    !EMAIL_PATTERN.test(value.email) ||
    value.email.length < EMAIL_MIN ||
    value.email.length > EMAIL_MAX
  ) {
    errors.email = t('validation.emailInvalid');
  }
  if (value.phone.length < PHONE_MIN || value.phone.length > PHONE_MAX) {
    errors.phone = t('validation.phoneRange', {min: PHONE_MIN, max: PHONE_MAX});
  }
  if (value.city.length < CITY_MIN || value.city.length > CITY_MAX) {
    errors.city = t('validation.cityRange', {min: CITY_MIN, max: CITY_MAX});
  }
  // `street` and `zipCode` are optional; a present value is validated, an empty one is omitted
  // from the request rather than sent as `''`, which the server's length rules would refuse.
  if (value.street !== '' && (value.street.length < STREET_MIN || value.street.length > STREET_MAX)) {
    errors.street = t('validation.streetRange', {min: STREET_MIN, max: STREET_MAX});
  }
  if (value.zipCode !== '' && (value.zipCode.length !== ZIP_LENGTH || !ZIP_PATTERN.test(value.zipCode))) {
    errors.zipCode = t('validation.zipCodeRule', {length: ZIP_LENGTH});
  }
  if (value.sizes.length === 0) {
    errors.sizes = t('validation.sizesRequired');
  }

  return errors;
};

/** The employees a form value names, one per line, with blank lines dropped. */
const parseEmployees = (value: string): string[] =>
  value
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');

/**
 * Builds the request body from a validated form value.
 *
 * The optional fields are omitted when empty rather than sent as `''`: the server's
 * `@IsOptional()` skips validation only for an absent value, so an empty `street`, `zipCode` or
 * `employees` would be validated against its own rules and refused. `employees` is always sent
 * as an array (an empty one clears the list on an edit, which is what emptying the textarea
 * means).
 */
const buildFacilityRequest = (value: IFacilityFormValue): IFacilityRequest => {
  const request: IFacilityRequest = {
    name: value.name,
    property: value.property,
    city: value.city,
    email: value.email,
    phone: value.phone,
    sizes: value.sizes,
    lighting: value.lighting,
    toilets: value.toilets,
    employees: parseEmployees(value.employees),
    active: value.active,
  };
  if (value.street !== '') {
    request.street = value.street;
  }
  if (value.zipCode !== '') {
    request.zipCode = value.zipCode;
  }
  return request;
};

/**
 * The field each server error message names, in the order to test them.
 *
 * The server's length messages ("Number of characters need to be between 3 and 125") name no
 * field, so those fall through to the general prompt; the messages that do name one are matched
 * here. `e-mail` is listed beside `email` because the server spells the field with a hyphen
 * ("E-mail address need to contains correct pattern"), and `size` matches both the "At least one
 * rentable size" and the "Size must be one of…" messages.
 */
const FACILITY_ERROR_TOKENS: ReadonlyArray<readonly [keyof IFacilityFormValue, string]> = [
  ['property', 'property'],
  ['zipCode', 'zipcode'],
  ['zipCode', 'zip code'],
  ['employees', 'employee'],
  ['lighting', 'lighting'],
  ['toilets', 'toilets'],
  ['email', 'e-mail'],
  ['email', 'email'],
  ['sizes', 'size'],
  ['city', 'city'],
  ['phone', 'phone'],
  ['street', 'street'],
  ['active', 'active'],
  ['name', 'name'],
];

/** The field a server message belongs to, or `null` when it names none of them. */
const facilityFieldForMessage = (message: string): keyof IFacilityFormValue | null => {
  const lower = message.toLowerCase();
  const match = FACILITY_ERROR_TOKENS.find(([, token]) => lower.includes(token));
  return match ? match[0] : null;
};

/**
 * Turns the API's `422` message list into field errors (T272).
 *
 * The server answers `{message: string[]}` for a validation failure; each message that names a
 * field is used to *locate* it and the form shows its own Polish text against it, while the
 * server's English sentence is never rendered (NFR-005, T061). A message that names no field —
 * the length rules, which several fields share — becomes the generic prompt, because an error
 * the user cannot see is an error they cannot act on.
 */
const mapFacilityServerErrors = (
  messages: readonly string[],
  t: TranslateFn
): IFacilityWriteErrors => {
  const fields: TFacilityFieldErrors = {};
  let unmatched = false;

  for (const message of messages) {
    const field = facilityFieldForMessage(message);
    if (field === null) {
      unmatched = true;
    } else {
      fields[field] = t('errors.fieldInvalid');
    }
  }

  return {fields, general: unmatched ? t('errors.generic') : null};
};

/**
 * The message shown when a facility delete is refused (T059, T272).
 *
 * A facility a booking or a staff assignment still references is refused with `409` and points
 * at deactivation; the modal shows the UI's own Polish for that status (NFR-005), never the
 * server's English sentence. A delete that silently does nothing looks like a broken button.
 */
const deleteFailureMessage = (error: unknown, t: TranslateFn): string => {
  if (error instanceof HttpErrorResponse && error.status === 409) {
    return t('facilities.deleteConflict');
  }
  return t('facilities.deleteFailure');
};

/**
 * A pragmatic e-mail check: something before the `@`, and a dotted domain after it.
 *
 * The server uses `@IsEmail`, which requires a dotted domain by default, so `a@b` is refused
 * on both sides. The check is deliberately not the full RFC grammar: a form that guesses wrong
 * turns a valid address into a blocked submission, and the server remains the authority.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The yes/no labels for the boolean flags, as translation keys (FR-001). */
const yesNo = (value: boolean): string => (value ? 'common.yes' : 'common.no');

/**
 * The facility detail rows (FR-009).
 *
 * The legacy panel showed the city, name, contact phone and e-mail and the employee list; the
 * issue adds the rentable sizes and the lighting/toilets flags, so the operator can see what
 * the facility can actually be booked as. An absent facility yields no rows, which is how the
 * screen shows "nothing loaded" rather than a stale default.
 */
const facilityDetails = (facility: IBuilding | null, t: TranslateFn): IDetailRow[] => {
  if (facility === null) {
    return [];
  }
  return [
    {label: t('facilities.details.city'), value: cityLabel(facility.city)},
    {label: t('facilities.details.name'), value: facility.name},
    {label: t('facilities.details.phone'), value: facility.phone},
    {label: t('facilities.details.email'), value: facility.email},
    {label: t('facilities.details.sizes'), value: facility.sizes.join(', ')},
    {label: t('facilities.details.lighting'), value: t(yesNo(facility.lighting))},
    {label: t('facilities.details.toilets'), value: t(yesNo(facility.toilets))},
    // The tab receives retired facilities too (T059), so the status is what tells an
    // administrator the facility is deactivated rather than simply in use.
    {label: t('facilities.details.status'), value: t(facility.active !== false ? 'facilities.active.yes' : 'facilities.active.no')},
  ];
};

/** The facility's employees as selector options, in the order the record stores them. */
const employeeOptions = (facility: IBuilding | null): IEmployeeOption[] =>
  facility === null ? [] : facility.employees.map((name) => ({value: name, label: name}));

/**
 * An empty message form for a facility.
 *
 * The recipient starts at the facility's contact address — the only address the data carries —
 * and the first employee is preselected, so the form is usable in one step. The legacy form
 * pre-filled its address field the same way. The operator overrides the recipient with the
 * employee's own address when there is one, which is the "employee address supplied by the
 * operator" the contract names.
 */
const emptyEmployeeMessage = (facility: IBuilding | null): IEmployeeMessageValue => ({
  person: facility?.employees[0] ?? '',
  recipient: facility?.email ?? '',
  message: '',
});

/**
 * Validates the message form, returning one message per invalid field.
 *
 * The messages mirror the server's `MessageDto` (`person`, `email` and `message` are required;
 * `recipient` must be an e-mail). The server is the authority and answers `422`; the form
 * checks the same rules so an obviously invalid message is caught before a round trip.
 */
const validateEmployeeMessage = (
  value: IEmployeeMessageValue,
  t: TranslateFn
): TEmployeeMessageErrors => {
  const errors: TEmployeeMessageErrors = {};

  if (value.person.trim() === '') {
    errors.person = t('validation.personRequired');
  }
  if (!EMAIL_PATTERN.test(value.recipient)) {
    errors.recipient = t('validation.emailInvalid');
  }
  if (value.message.trim() === '') {
    errors.message = t('validation.messageRequired');
  }

  return errors;
};

/**
 * Builds the request body from a validated form value.
 *
 * `email` is the facility's contact address — the sender a reply returns to — and `recipient`
 * is the employee's destination. The legacy form used one address for both, which is why the
 * rewrite splits them: the route takes the destination from `recipient` and the sender from
 * `email`.
 */
const buildMessageRequest = (
  value: IEmployeeMessageValue,
  facility: IBuilding | null
): IMessageRequest => ({
  person: value.person,
  email: facility?.email ?? '',
  message: value.message,
  recipient: value.recipient,
});

/**
 * The visible message for a failed send (FR-036, issue #42 acceptance criterion 3).
 *
 * The legacy error branch was commented out, so a failed send looked like a success. Every
 * failure is surfaced here: a `422` shows the server's field messages (or a generic prompt),
 * and any other status — a `502` provider failure in particular — shows a retry message. There
 * is no status that returns `null`.
 */
const sendFailureMessage = (status: number, t: TranslateFn): string => {
  // A `422` is a field problem the form already validates in Polish; the server's English
  // message list is not rendered (NFR-005, T061). Any other status is a provider failure
  // (FR-036), which is a retry prompt.
  if (status === 422) {
    return t('facilities.sendValidation');
  }
  return t('facilities.sendFailure');
};

export {
  EMAIL_PATTERN,
  NAME_MIN,
  NAME_MAX,
  EMAIL_MIN,
  EMAIL_MAX,
  PHONE_MIN,
  PHONE_MAX,
  CITY_MIN,
  CITY_MAX,
  STREET_MIN,
  STREET_MAX,
  ZIP_LENGTH,
  ZIP_PATTERN,
  yesNo,
  facilityDetails,
  employeeOptions,
  emptyEmployeeMessage,
  validateEmployeeMessage,
  buildMessageRequest,
  sendFailureMessage,
  emptyFacilityForm,
  formFromFacility,
  validateFacilityForm,
  buildFacilityRequest,
  parseEmployees,
  mapFacilityServerErrors,
  deleteFailureMessage,
};
export type {
  IDetailRow,
  IEmployeeOption,
  IEmployeeMessageValue,
  TEmployeeMessageErrors,
  IFacilityFormValue,
  TFacilityFieldErrors,
  IFacilityWriteErrors,
};
