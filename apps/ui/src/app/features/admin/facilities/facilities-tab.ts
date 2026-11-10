import {CITY_LABELS, IBuilding} from '@models/building.model';
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

/**
 * A pragmatic e-mail check: something before the `@`, and a dotted domain after it.
 *
 * The server uses `@IsEmail`, which requires a dotted domain by default, so `a@b` is refused
 * on both sides. The check is deliberately not the full RFC grammar: a form that guesses wrong
 * turns a valid address into a blocked submission, and the server remains the authority.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The Polish yes/no labels for the boolean flags (legacy showed these as "Tak"/"Nie"). */
const yesNo = (value: boolean): string => (value ? 'Tak' : 'Nie');

/**
 * The facility detail rows (FR-009).
 *
 * The legacy panel showed the city, name, contact phone and e-mail and the employee list; the
 * issue adds the rentable sizes and the lighting/toilets flags, so the operator can see what
 * the facility can actually be booked as. An absent facility yields no rows, which is how the
 * screen shows "nothing loaded" rather than a stale default.
 */
const facilityDetails = (facility: IBuilding | null): IDetailRow[] => {
  if (facility === null) {
    return [];
  }
  return [
    {label: 'Miejscowość', value: CITY_LABELS[facility.city]},
    {label: 'Nazwa obiektu', value: facility.name},
    {label: 'Telefon kontaktowy', value: facility.phone},
    {label: 'E-mail', value: facility.email},
    {label: 'Powierzchnie', value: facility.sizes.join(', ')},
    {label: 'Oświetlenie', value: yesNo(facility.lighting)},
    {label: 'Toalety', value: yesNo(facility.toilets)},
    // The tab receives retired facilities too (T059), so the status is what tells an
    // administrator the facility is deactivated rather than simply in use.
    {label: 'Status', value: facility.active !== false ? 'Aktywny' : 'Nieaktywny'},
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
const validateEmployeeMessage = (value: IEmployeeMessageValue): TEmployeeMessageErrors => {
  const errors: TEmployeeMessageErrors = {};

  if (value.person.trim() === '') {
    errors.person = 'Wybierz pracownika';
  }
  if (!EMAIL_PATTERN.test(value.recipient)) {
    errors.recipient = 'Podaj poprawny adres e-mail';
  }
  if (value.message.trim() === '') {
    errors.message = 'Wiadomość nie może być pusta';
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
const sendFailureMessage = (status: number, messages: readonly string[]): string => {
  if (status === 422) {
    return messages.length > 0 ? messages.join(' ') : 'Popraw dane i spróbuj ponownie.';
  }
  return 'Nie udało się wysłać wiadomości. Spróbuj ponownie później.';
};

export {
  EMAIL_PATTERN,
  yesNo,
  facilityDetails,
  employeeOptions,
  emptyEmployeeMessage,
  validateEmployeeMessage,
  buildMessageRequest,
  sendFailureMessage,
};
export type {IDetailRow, IEmployeeOption, IEmployeeMessageValue, TEmployeeMessageErrors};
