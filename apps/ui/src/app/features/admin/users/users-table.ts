import {COPY} from '@booking/copy';
import {IUserRequest, IUserUpdateRequest, TUserRole} from '@models/user.model';
import {TCity} from '@models/building.model';

/**
 * The admin Users tab's pure logic (FR-045, FR-047).
 *
 * Everything here is a function over plain values so the role labels, the conditional assignment
 * rule, the request building and the row shaping are unit-testable without a rendered table — the
 * same shape `clients-table.ts` gives the Clients tab. The component holds signals and calls
 * these; it does not re-derive a label or decide whether a field is required inline.
 *
 * The validation mirrors the server's `UserDto` field by field. The server is the authority and
 * answers `422`; the form checks the same rules so a bad value is caught before a round trip, and
 * so a request the server would refuse is never sent. The one conditional rule is the city: the
 * server requires it for every role except `ADMIN` (a non-administrator is scoped to a facility,
 * and a missing city would leave that scope undefined), so the form does the same.
 */

/** The server's `UserDto` bounds, restated where the form can read them. */
const NAME_MIN = 3;
const NAME_MAX = 125;
const EMAIL_MIN = 3;
const EMAIL_MAX = 125;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 30;

/** A pragmatic e-mail check, matching the clients form: something before the `@` and a dotted
 * domain after it, because `@IsEmail` requires a dotted domain and the two must agree. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The role labels, from the shared copy catalogue (NFR-005, T061). */
const ROLE_LABELS: Record<TUserRole, string> = COPY.users.roleLabels;

/** The roles a caller may choose, in the order the legacy form offered them. */
const ROLE_OPTIONS: readonly TUserRole[] = ['ADMIN', 'OFFICE', 'EMPLOYEE'];

/** The columns the table renders. */
const USER_COLUMNS = [
  {key: 'name', label: COPY.users.columns.name},
  {key: 'email', label: COPY.users.columns.email},
  {key: 'roleLabel', label: COPY.users.columns.role},
  {key: 'cityLabel', label: COPY.users.columns.city},
  {key: 'activeLabel', label: COPY.users.columns.status},
];

/** A form value, before it is turned into a request body. Strings because inputs yield strings. */
interface IUserFormValue {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  recheckPassword: string;
  role: TUserRole;
  city: string;
  buildings: string[];
  active: boolean;
}

/** The field errors the form shows, keyed by the field they belong to. */
type TUserFieldErrors = Partial<Record<keyof IUserFormValue, string>>;

/** The errors a failed write produced: the per-field map and any message that matched no field. */
interface IUserWriteErrors {
  fields: TUserFieldErrors;
  general: string | null;
}

/** An empty form, defaulting to the least-privileged role so a save without a role is refused. */
const emptyUserForm = (): IUserFormValue => ({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  recheckPassword: '',
  role: 'EMPLOYEE',
  city: '',
  buildings: [],
  active: true,
});

/** The form value for an existing account, so an edit starts from what is stored. */
const formFromUser = (user: {
  firstName: string;
  lastName: string;
  email: string;
  role: TUserRole;
  city?: string;
  buildings?: string[];
  active: boolean;
}): IUserFormValue => ({
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  // The stored password is a hash the API never returns, so an edit never prefills it. A blank
  // field means "leave the password unchanged", which `buildUserRequest` reads the same way.
  password: '',
  recheckPassword: '',
  role: user.role,
  city: user.city ?? '',
  buildings: user.buildings ?? [],
  active: user.active,
});

/** Whether a city is required for this role: every role except `ADMIN` (server `UserDto`). */
const isCityRequired = (role: TUserRole): boolean => role !== 'ADMIN';

/**
 * Validates the form, returning one message per invalid field.
 *
 * `editing` distinguishes create from update: a create needs a password, an edit does not, because
 * the form cannot prefill the hash the server holds and a blank password means "unchanged". The
 * confirmation must match whenever a password is supplied, which is the `PasswordConfirmation`
 * rule the server enforces.
 */
const validateUserForm = (value: IUserFormValue, editing: boolean): TUserFieldErrors => {
  const errors: TUserFieldErrors = {};

  if (value.firstName.length < NAME_MIN || value.firstName.length > NAME_MAX) {
    errors.firstName = COPY.validation.firstNameRange(NAME_MIN, NAME_MAX);
  }
  if (value.lastName.length < NAME_MIN || value.lastName.length > NAME_MAX) {
    errors.lastName = COPY.validation.lastNameRange(NAME_MIN, NAME_MAX);
  }
  if (
    !EMAIL_PATTERN.test(value.email) ||
    value.email.length < EMAIL_MIN ||
    value.email.length > EMAIL_MAX
  ) {
    errors.email = COPY.validation.emailInvalid;
  }

  const passwordSupplied = value.password !== '';
  if (!editing || passwordSupplied) {
    if (value.password.length < PASSWORD_MIN || value.password.length > PASSWORD_MAX) {
      errors.password = COPY.validation.passwordRange(PASSWORD_MIN, PASSWORD_MAX);
    }
  }
  if (passwordSupplied && value.password !== value.recheckPassword) {
    errors.recheckPassword = COPY.validation.passwordsMismatch;
  }

  if (isCityRequired(value.role) && value.city.trim() === '') {
    errors.city = COPY.validation.cityRequired;
  }

  return errors;
};

/**
 * Builds the request body from a validated form value.
 *
 * `city` is omitted for an administrator and `buildings` is omitted when empty, because the
 * request body and the stored document are different shapes: an administrator is not tied to a
 * facility, and an empty assignment list is the absence of one rather than a stored `[]`. On an
 * edit a blank password is omitted entirely, so the server leaves the stored hash alone rather
 * than hashing an empty string.
 *
 * Create and update are two functions rather than one with a flag: a create always carries the
 * password pair and an update may omit it, so the two return shapes differ.
 */
type TUserCommonFields = Pick<
  IUserRequest,
  'firstName' | 'lastName' | 'email' | 'role' | 'active' | 'city' | 'buildings'
>;

const baseFields = (value: IUserFormValue): TUserCommonFields => {
  const request: TUserCommonFields = {
    firstName: value.firstName,
    lastName: value.lastName,
    email: value.email,
    role: value.role,
    active: value.active,
  };
  if (isCityRequired(value.role)) {
    request.city = value.city;
  }
  if (value.buildings.length > 0) {
    request.buildings = value.buildings;
  }
  return request;
};

const buildCreateRequest = (value: IUserFormValue): IUserRequest => ({
  ...baseFields(value),
  password: value.password,
  recheckPassword: value.recheckPassword,
});

const buildUpdateRequest = (value: IUserFormValue): IUserUpdateRequest => {
  const request: IUserUpdateRequest = {...baseFields(value)};
  if (value.password !== '') {
    request.password = value.password;
    request.recheckPassword = value.recheckPassword;
  }
  return request;
};

/**
 * The field each server error message names, in the order to test them.
 *
 * `recheck` and `confirm` precede `password` because the confirmation message contains the word
 * "password" in its server spelling; a field with two spellings of its name gets two entries,
 * because `find` stops at the first match. The role and active messages name no field and fall
 * through to `general`.
 */
const ERROR_FIELD_TOKENS: ReadonlyArray<readonly [keyof IUserFormValue, string]> = [
  ['recheckPassword', 'recheck'],
  ['recheckPassword', 'confirm'],
  ['recheckPassword', 'not match'],
  ['firstName', 'first'],
  ['lastName', 'last'],
  ['email', 'email'],
  ['city', 'city'],
  ['buildings', 'building'],
  ['password', 'password'],
];

/** The field a server message belongs to, or `null` when it names none of them. */
const fieldForMessage = (message: string): keyof IUserFormValue | null => {
  // Hyphens are removed so "E-mail" matches the `email` token; the server spells the field that
  // way in its message while the request field is `email`.
  const lower = message.toLowerCase().replace(/-/g, '');
  const match = ERROR_FIELD_TOKENS.find(([, token]) => lower.includes(token));
  return match ? match[0] : null;
};

/**
 * Turns the API's `422` message list into field errors.
 *
 * A message that names no field is returned as `general` rather than dropped: an error the user
 * cannot see is an error they cannot act on. The messages are joined, so two unmatched ones are
 * both shown.
 */
const mapServerErrors = (messages: readonly string[]): IUserWriteErrors => {
  const fields: TUserFieldErrors = {};
  let unmatched = false;

  for (const message of messages) {
    const field = fieldForMessage(message);
    if (field === null) {
      unmatched = true;
    } else {
      fields[field] = COPY.errors.fieldInvalid;
    }
  }

  return {fields, general: unmatched ? COPY.errors.generic : null};
};

/** Shapes an account into the row the table renders. */
const toRow = (user: {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: TUserRole;
  city?: string;
  active: boolean;
}): Record<string, unknown> => ({
  _id: user._id,
  name: `${user.firstName} ${user.lastName}`,
  email: user.email,
  roleLabel: ROLE_LABELS[user.role],
  cityLabel: user.city ?? COPY.common.dash,
  activeLabel: user.active ? COPY.users.active.yes : COPY.users.active.no,
  user,
});

/** The city selector's options, from the shared city labels. */
const cityOptions = (labels: Record<TCity, string>): Array<{value: string; label: string}> =>
  (Object.keys(labels) as TCity[]).map((city) => ({value: city, label: labels[city]}));

export {
  ROLE_LABELS,
  ROLE_OPTIONS,
  USER_COLUMNS,
  NAME_MIN,
  NAME_MAX,
  EMAIL_MIN,
  EMAIL_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
  EMAIL_PATTERN,
  emptyUserForm,
  formFromUser,
  isCityRequired,
  validateUserForm,
  buildCreateRequest,
  buildUpdateRequest,
  mapServerErrors,
  toRow,
  cityOptions,
};
export type {IUserFormValue, TUserFieldErrors, IUserWriteErrors};
