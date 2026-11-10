import {HttpErrorResponse} from '@angular/common/http';
import {COPY} from '@booking/copy';
import {IClient, IClientRequest} from '@models/client.model';
import {TClientType} from '@models/booking.model';

/**
 * The admin clients tab's pure logic (FR-024, FR-025, FR-026).
 *
 * Everything here is a function over plain values so the type-driven label, the NIP rule, the
 * row shaping and the validation are unit-testable without a rendered table — the same shape
 * `bookings-table.ts` gives the bookings tab. The component holds signals and calls these; it
 * does not re-derive a label or decide whether a field is required inline.
 *
 * The validation mirrors the server's `ClientDto`/`UpdateClientDto` field by field. The server
 * is the authority and answers `422`; the form checks the same rules so a bad value is caught
 * before a round trip, and so a request the server would refuse is never sent. The NIP rule is
 * the one the issue names: required for a company, refused for an individual (legacy
 * `ClientForm` showed the field only for a company).
 */

/** The server's `ClientDto` bounds, restated where the form can read them. */
const NAME_MIN = 3;
const NAME_MAX = 125;
const NICK_MIN = 3;
const NICK_MAX = 125;
const CONTACT_MIN = 3;
const CONTACT_MAX = 125;
const EMAIL_MIN = 3;
const EMAIL_MAX = 125;
const PHONE_MIN = 3;
const PHONE_MAX = 15;
const STREET_MIN = 3;
const STREET_MAX = 125;
const CITY_MIN = 3;
const CITY_MAX = 125;
const ZIP_LENGTH = 6;
const ZIP_PATTERN = /^[\d./-]+$/;
const NIP_MIN = 10;
const NIP_MAX = 15;
const NIP_PATTERN = /^[\d./-]+$/;

/**
 * A pragmatic e-mail check: something before the `@`, and a dotted domain after it.
 *
 * The server uses `@IsEmail`, which requires a dotted domain by default, so a value this
 * accepts and the server rejects is the case to avoid — `a@b` is refused on both sides. The
 * check is deliberately not the full RFC grammar: a form that guesses wrong turns a valid
 * address into a blocked submission, and the server remains the authority.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The client-type labels, from the shared copy catalogue (NFR-005, T061). */
const CLIENT_TYPE_LABELS: Record<TClientType, string> = COPY.clients.typeLabels;

/** The name field's label, which the legacy `ClientForm` switched by type. */
const nameLabelFor = (type: TClientType): string =>
  type === 'COMPANY' ? COPY.clients.fields.nameCompany : COPY.clients.fields.namePerson;

/** The page sizes the tab offers, matching the bookings table. */
const PAGE_SIZES = [20, 50, 100];

/** The columns the table renders, in the legacy `RECORDS_CLIENTS_HEADERS` order. */
const CLIENT_COLUMNS = [
  {key: 'name', label: COPY.clients.columns.name},
  {key: 'contactPerson', label: COPY.clients.columns.contactPerson},
  {key: 'phone', label: COPY.clients.columns.phone},
  {key: 'email', label: COPY.clients.columns.email},
  {key: 'city', label: COPY.clients.columns.city},
  {key: 'activeLabel', label: COPY.clients.columns.status},
];

/** A form value, before it is turned into a request body. Strings because inputs yield strings. */
interface IClientFormValue {
  type: TClientType;
  name: string;
  nick: string;
  contactPerson: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
  nip: string;
  active: boolean;
}

/** The field errors the form shows, keyed by the field they belong to. */
type TClientFieldErrors = Partial<Record<keyof IClientFormValue, string>>;

/** The errors a failed write produced: the per-field map and any message that matched no field. */
interface IClientWriteErrors {
  fields: TClientFieldErrors;
  general: string | null;
}

/** An empty form, defaulting to an individual so the NIP field starts hidden. */
const emptyClientForm = (): IClientFormValue => ({
  type: 'INDIVIDUAL',
  name: '',
  nick: '',
  contactPerson: '',
  phone: '',
  email: '',
  street: '',
  city: '',
  zipCode: '',
  nip: '',
  active: true,
});

/** The form value for an existing client, so an edit starts from what is stored. */
const formFromClient = (client: IClient): IClientFormValue => ({
  type: client.type,
  name: client.name,
  nick: client.nick ?? '',
  contactPerson: client.contactPerson,
  phone: client.phone,
  email: client.email,
  street: client.street,
  city: client.city,
  zipCode: client.zipCode,
  nip: client.nip ?? '',
  // Absent on a legacy record, which reads as active (T059).
  active: client.active !== false,
});

/** Whether a NIP is required for this type (legacy `ClientForm` required it for a company). */
const isNipRequired = (type: TClientType): boolean => type === 'COMPANY';

/**
 * Validates the form, returning one message per invalid field.
 *
 * The messages name the field and the bound so the user can correct it. The NIP rule is
 * type-driven: a company without one is refused, and an individual with one is refused rather
 * than silently ignored — dropping input is how a user comes to believe a tax id was saved.
 */
const validateClientForm = (value: IClientFormValue): TClientFieldErrors => {
  const errors: TClientFieldErrors = {};

  if (value.name.length < NAME_MIN || value.name.length > NAME_MAX) {
    errors.name = COPY.validation.nameRange(NAME_MIN, NAME_MAX);
  }
  if (value.nick !== '' && (value.nick.length < NICK_MIN || value.nick.length > NICK_MAX)) {
    errors.nick = COPY.validation.nickRange(NICK_MIN, NICK_MAX);
  }
  if (value.contactPerson.length < CONTACT_MIN || value.contactPerson.length > CONTACT_MAX) {
    errors.contactPerson = COPY.validation.contactPersonRange(CONTACT_MIN, CONTACT_MAX);
  }
  if (value.phone.length < PHONE_MIN || value.phone.length > PHONE_MAX) {
    errors.phone = COPY.validation.phoneRange(PHONE_MIN, PHONE_MAX);
  }
  if (
    !EMAIL_PATTERN.test(value.email) ||
    value.email.length < EMAIL_MIN ||
    value.email.length > EMAIL_MAX
  ) {
    errors.email = COPY.validation.emailInvalid;
  }
  if (value.street.length < STREET_MIN || value.street.length > STREET_MAX) {
    errors.street = COPY.validation.streetRange(STREET_MIN, STREET_MAX);
  }
  if (value.city.length < CITY_MIN || value.city.length > CITY_MAX) {
    errors.city = COPY.validation.cityRange(CITY_MIN, CITY_MAX);
  }
  if (value.zipCode.length !== ZIP_LENGTH || !ZIP_PATTERN.test(value.zipCode)) {
    errors.zipCode = COPY.validation.zipCodeRule(ZIP_LENGTH);
  }
  if (isNipRequired(value.type)) {
    if (value.nip.length < NIP_MIN || value.nip.length > NIP_MAX || !NIP_PATTERN.test(value.nip)) {
      errors.nip = COPY.validation.nipRequired(NIP_MIN, NIP_MAX);
    }
  } else if (value.nip !== '') {
    errors.nip = COPY.validation.nipNotIndividual;
  }

  return errors;
};

/**
 * Builds the request body from a validated form value.
 *
 * `nick` is omitted when empty and `nip` is sent only for a company, because the request body
 * and the stored document are different shapes: an empty `nick` is a value the schema would
 * store as `''`, and a `nip` on an individual is refused by the server.
 */
const buildClientRequest = (value: IClientFormValue): IClientRequest => {
  const request: IClientRequest = {
    type: value.type,
    name: value.name,
    contactPerson: value.contactPerson,
    phone: value.phone,
    email: value.email,
    street: value.street,
    city: value.city,
    zipCode: value.zipCode,
    active: value.active,
  };
  if (value.nick !== '') {
    request.nick = value.nick;
  }
  if (isNipRequired(value.type)) {
    request.nip = value.nip;
  }
  return request;
};

/**
 * The field each server error message names, in the order to test them.
 *
 * `zipCode` and `nip` come first because their server messages name the field in prose ("Zip
 * code may only contain…", "NIP is required…") rather than as the property; `contactPerson`
 * precedes `name` because its default message contains the word "name". A field with two
 * spellings of its name gets two entries, because `find` stops at the first match and both
 * must resolve to the same field.
 */
const ERROR_FIELD_TOKENS: ReadonlyArray<readonly [keyof IClientFormValue, string]> = [
  ['nip', 'nip'],
  ['zipCode', 'zipcode'],
  ['zipCode', 'zip code'],
  ['contactPerson', 'contactperson'],
  ['contactPerson', 'contact person'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['street', 'street'],
  ['city', 'city'],
  ['nick', 'nick'],
  ['name', 'name'],
  ['type', 'type'],
];

/** The field a server message belongs to, or `null` when it names none of them. */
const fieldForMessage = (message: string): keyof IClientFormValue | null => {
  const lower = message.toLowerCase();
  const match = ERROR_FIELD_TOKENS.find(([, token]) => lower.includes(token));
  return match ? match[0] : null;
};

/**
 * Turns the API's `422` message list into field errors (FR-026, acceptance criterion 3).
 *
 * The server answers `{message: string[]}` for a validation failure; each message names the
 * field it is about, so it is used to *locate* that field and the form shows its own Polish
 * text against it. The server's English sentence is never rendered (NFR-005, T061): the API is
 * English by convention, the UI is Polish, and the two are joined by the field, not the words.
 * A message that names no field becomes the generic prompt, because an error the user cannot
 * see is an error they cannot act on.
 */
const mapServerErrors = (messages: readonly string[]): IClientWriteErrors => {
  const fields: TClientFieldErrors = {};
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

/** Shapes a client into the row the table renders. */
const toRow = (client: IClient): Record<string, unknown> => ({
  _id: client._id,
  name: client.name,
  contactPerson: client.contactPerson,
  phone: client.phone,
  email: client.email,
  city: client.city,
  typeLabel: CLIENT_TYPE_LABELS[client.type],
  nipLabel: client.nip ?? COPY.common.dash,
  activeLabel: client.active !== false ? COPY.clients.active.yes : COPY.clients.active.no,
  client,
});

/**
 * The message shown when a delete is refused (T059).
 *
 * A client a booking still references is refused with `409` and the server's message names the
 * situation and the supported alternative (deactivation). That message is shown rather than a
 * generic one: a delete that silently does nothing looks like a broken button. The `409` body
 * is the global filter's `{statusCode, message, error}` shape, so `message` is a string.
 */
const deleteFailureMessage = (error: unknown): string => {
  if (error instanceof HttpErrorResponse && error.status === 409) {
    // The `409` body carries the server's English reason, but the UI shows its own Polish
    // text (NFR-005, T061): the status is what says "referenced by a booking", and the client
    // must not render the API's sentence.
    return COPY.clients.deleteConflict;
  }
  return COPY.clients.deleteFailure;
};

export {
  CLIENT_COLUMNS,
  CLIENT_TYPE_LABELS,
  PAGE_SIZES,
  NAME_MIN,
  NAME_MAX,
  NICK_MIN,
  NICK_MAX,
  CONTACT_MIN,
  CONTACT_MAX,
  EMAIL_MIN,
  EMAIL_MAX,
  PHONE_MIN,
  PHONE_MAX,
  STREET_MIN,
  STREET_MAX,
  CITY_MIN,
  CITY_MAX,
  ZIP_LENGTH,
  ZIP_PATTERN,
  NIP_MIN,
  NIP_MAX,
  NIP_PATTERN,
  EMAIL_PATTERN,
  nameLabelFor,
  isNipRequired,
  emptyClientForm,
  formFromClient,
  validateClientForm,
  buildClientRequest,
  mapServerErrors,
  toRow,
  deleteFailureMessage,
};
export type {IClientFormValue, TClientFieldErrors, IClientWriteErrors};
