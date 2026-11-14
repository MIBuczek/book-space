import {HttpErrorResponse} from '@angular/common/http';
import {IClient} from '@models/client.model';
import {
  CLIENT_COLUMNS,
  CLIENT_TYPE_LABELS,
  PAGE_SIZES,
  buildClientRequest,
  deleteFailureMessage,
  emptyClientForm,
  formFromClient,
  isNipRequired,
  mapServerErrors,
  nameLabelFor,
  toRow,
  validateClientForm,
} from './clients-table';
import type {IClientFormValue} from './clients-table';
import {testTranslate} from '../../../../testing/i18n-testing';

const validForm = (overrides: Partial<IClientFormValue> = {}): IClientFormValue => ({
  type: 'COMPANY',
  name: 'Firma sp. z o.o.',
  nick: '',
  contactPerson: 'Jan Nowak',
  phone: '609996064',
  email: 'biuro@example.com',
  street: 'ul. Kwiatowa 1',
  city: 'siechnice',
  zipCode: '55-010',
  nip: '8991234567',
  active: true,
  ...overrides,
});

const client = (overrides: Partial<IClient> = {}): IClient => ({
  _id: 'c1',
  type: 'COMPANY',
  name: 'Firma sp. z o.o.',
  contactPerson: 'Jan Nowak',
  phone: '609996064',
  email: 'biuro@example.com',
  street: 'ul. Kwiatowa 1',
  city: 'siechnice',
  zipCode: '55-010',
  nip: '8991234567',
  ...overrides,
});

const t = testTranslate();

describe('nameLabelFor', () => {
  it('switches the label by type, matching the legacy ClientForm', () => {
    expect(t(nameLabelFor('COMPANY'))).toBe('Nazwa firmy');
    expect(t(nameLabelFor('INDIVIDUAL'))).toBe('Imię i nazwisko');
  });
});

describe('isNipRequired', () => {
  it('requires a NIP only for a company', () => {
    expect(isNipRequired('COMPANY')).toBe(true);
    expect(isNipRequired('INDIVIDUAL')).toBe(false);
  });
});

describe('CLIENT_TYPE_LABELS', () => {
  it('labels the types as the legacy CLIENT_OPTIONS did', () => {
    expect(CLIENT_TYPE_LABELS['INDIVIDUAL']).toBe('clients.typeLabels.INDIVIDUAL');
    expect(CLIENT_TYPE_LABELS['COMPANY']).toBe('clients.typeLabels.COMPANY');
  });
});

describe('CLIENT_COLUMNS', () => {
  it('lists the columns in the legacy header order', () => {
    expect(CLIENT_COLUMNS.map((column) => t(column.label))).toEqual([
      'Nazwa',
      'Osoba kontaktowa',
      'Telefon',
      'E-mail',
      'Miasto',
      'Status',
    ]);
  });
});

describe('PAGE_SIZES', () => {
  it('offers the same page sizes as the bookings table', () => {
    expect(PAGE_SIZES).toEqual([20, 50, 100]);
  });
});

describe('emptyClientForm', () => {
  it('starts as an individual with empty fields', () => {
    const form = emptyClientForm();

    expect(form.type).toBe('INDIVIDUAL');
    expect(form.name).toBe('');
    expect(form.nip).toBe('');
  });
});

describe('formFromClient', () => {
  it('copies the stored client into the form, defaulting the optional fields', () => {
    expect(formFromClient(client())).toEqual({
      type: 'COMPANY',
      name: 'Firma sp. z o.o.',
      nick: '',
      contactPerson: 'Jan Nowak',
      phone: '609996064',
      email: 'biuro@example.com',
      street: 'ul. Kwiatowa 1',
      city: 'siechnice',
      zipCode: '55-010',
      nip: '8991234567',
      active: true,
    });
  });

  it('keeps a stored nick and nip', () => {
    const form = formFromClient(client({nick: 'Kowalski', nip: '1234567890'}));

    expect(form.nick).toBe('Kowalski');
    expect(form.nip).toBe('1234567890');
  });

  it('defaults a missing nick and nip to empty strings', () => {
    const form = formFromClient(client({nick: undefined, nip: undefined, type: 'INDIVIDUAL'}));

    expect(form.nick).toBe('');
    expect(form.nip).toBe('');
  });

  it('reads an absent active flag as active (T059)', () => {
    // A legacy record predates the field, and an absent value must not read as retired.
    expect(formFromClient(client({active: undefined})).active).toBe(true);
    expect(formFromClient(client({active: false})).active).toBe(false);
  });
});

describe('validateClientForm', () => {
  it('accepts a complete company form', () => {
    expect(validateClientForm(validForm(), t)).toEqual({});
  });

  it('accepts an individual with no NIP', () => {
    expect(validateClientForm(validForm({type: 'INDIVIDUAL', nip: ''}), t)).toEqual({});
  });

  it('requires a NIP for a company', () => {
    // The rule the issue names: selecting company type reveals and requires NIP.
    expect(validateClientForm(validForm({nip: ''}), t).nip).toMatch(/NIP jest wymagany/);
  });

  it('rejects a malformed NIP', () => {
    expect(validateClientForm(validForm({nip: '12'}), t).nip).toBeDefined();
    expect(validateClientForm(validForm({nip: '89912345ab'}), t).nip).toBeDefined();
  });

  it('refuses a NIP on an individual rather than ignoring it', () => {
    expect(validateClientForm(validForm({type: 'INDIVIDUAL', nip: '8991234567'}), t).nip).toBe(
      'NIP nie dotyczy osoby prywatnej'
    );
  });

  it('bounds the name', () => {
    expect(validateClientForm(validForm({name: 'ab'}), t).name).toBeDefined();
    expect(validateClientForm(validForm({name: 'x'.repeat(126)}), t).name).toBeDefined();
  });

  it('accepts an empty optional nick but bounds a supplied one', () => {
    expect(validateClientForm(validForm({nick: ''}), t).nick).toBeUndefined();
    expect(validateClientForm(validForm({nick: 'ab'}), t).nick).toBeDefined();
    expect(validateClientForm(validForm({nick: 'x'.repeat(126)}), t).nick).toBeDefined();
  });

  it('bounds the contact person', () => {
    expect(validateClientForm(validForm({contactPerson: 'ab'}), t).contactPerson).toBeDefined();
  });

  it('bounds the phone', () => {
    expect(validateClientForm(validForm({phone: '12'}), t).phone).toBeDefined();
    expect(validateClientForm(validForm({phone: '1'.repeat(16)}), t).phone).toBeDefined();
  });

  it('requires a plausible e-mail', () => {
    expect(validateClientForm(validForm({email: 'not-an-email'}), t).email).toBeDefined();
    expect(validateClientForm(validForm({email: 'a@b'}), t).email).toBeDefined();
  });

  it('bounds the street and the city', () => {
    expect(validateClientForm(validForm({street: 'ab'}), t).street).toBeDefined();
    expect(validateClientForm(validForm({city: 'ab'}), t).city).toBeDefined();
  });

  it('requires a six-character zip code of digits, dots, slashes and dashes', () => {
    expect(validateClientForm(validForm({zipCode: '55-01'}), t).zipCode).toBeDefined();
    expect(validateClientForm(validForm({zipCode: '55-01a'}), t).zipCode).toBeDefined();
    expect(validateClientForm(validForm({zipCode: '55-010'}), t).zipCode).toBeUndefined();
  });
});

describe('buildClientRequest', () => {
  it('omits an empty nick and the NIP of an individual', () => {
    const request = buildClientRequest(validForm({type: 'INDIVIDUAL', nick: '', nip: ''}));

    expect(request).not.toHaveProperty('nick');
    expect(request).not.toHaveProperty('nip');
    expect(request).toMatchObject({type: 'INDIVIDUAL', name: 'Firma sp. z o.o.'});
  });

  it('includes the nick when set and the NIP for a company', () => {
    const request = buildClientRequest(validForm({nick: 'Kowalski'}));

    expect(request.nick).toBe('Kowalski');
    expect(request.nip).toBe('8991234567');
  });

  it('carries the active flag so an edit can deactivate or reactivate (T059)', () => {
    expect(buildClientRequest(validForm({active: false})).active).toBe(false);
    expect(buildClientRequest(validForm({active: true})).active).toBe(true);
  });
});

describe('mapServerErrors', () => {
  it('attaches each message to the field it names', () => {
    const {fields, general} = mapServerErrors([
      'city must be longer than or equal to 3 characters',
      'NIP is required for a company (10–15 characters, digits, dots, slashes and dashes).',
      'Zip code may only contain digits, dots, slashes and dashes',
    ], t);

    // The field is located from the server's message; the text shown is the UI's own Polish
    // (NFR-005, T061), so the server's English is never rendered.
    expect(fields.city).toBe('Nieprawidłowa wartość.');
    expect(fields.nip).toBe('Nieprawidłowa wartość.');
    expect(fields.zipCode).toBe('Nieprawidłowa wartość.');
    expect(general).toBeNull();
  });

  it('maps the contact person before the name, whose message it contains', () => {
    const {fields} = mapServerErrors([
      'contactPerson must be longer than or equal to 3 characters',
      'name must be longer than or equal to 3 characters',
    ], t);

    expect(fields.contactPerson).toBeDefined();
    expect(fields.name).toBeDefined();
  });

  it('returns the generic prompt for a message that names no field rather than dropping it', () => {
    const {fields, general} = mapServerErrors(['property nonsense should not exist'], t);

    expect(fields).toEqual({});
    expect(general).toBe('Popraw dane i spróbuj ponownie.');
  });

  it('shows one generic prompt for several unmatched messages', () => {
    const {general} = mapServerErrors(['first unknown', 'second unknown'], t);

    expect(general).toBe('Popraw dane i spróbuj ponownie.');
  });

  it('returns no general message for an empty list', () => {
    expect(mapServerErrors([], t)).toEqual({fields: {}, general: null});
  });
});

describe('toRow', () => {
  it('shapes a company into the row the table renders', () => {
    const row = toRow(client(), t);

    expect(row).toMatchObject({
      _id: 'c1',
      name: 'Firma sp. z o.o.',
      contactPerson: 'Jan Nowak',
      phone: '609996064',
      email: 'biuro@example.com',
      city: 'siechnice',
      typeLabel: 'Firma',
      nipLabel: '8991234567',
      activeLabel: 'Aktywny',
    });
  });

  it('shows a dash for a client with no NIP', () => {
    const row = toRow(client({type: 'INDIVIDUAL', nip: undefined}), t);

    expect(row['typeLabel']).toBe('Osoba prywatna');
    expect(row['nipLabel']).toBe('—');
  });

  it('labels a retired client and reads an absent flag as active (T059)', () => {
    expect(toRow(client({active: false}), t)['activeLabel']).toBe('Nieaktywny');
    expect(toRow(client({active: undefined}), t)['activeLabel']).toBe('Aktywny');
  });
});

describe('deleteFailureMessage', () => {
  const conflict = (message: unknown) =>
    new HttpErrorResponse({status: 409, statusText: 'Conflict', error: {statusCode: 409, message}});

  it('shows the UI own Polish message for a 409, not the server English (T061)', () => {
    // The status is what identifies the reason; the API's sentence is English and is not
    // rendered (NFR-005).
    expect(deleteFailureMessage(conflict('This client is referenced by a booking.'), t)).toContain(
      'dezaktywuj klienta'
    );
  });

  it('falls back to a Polish message when the 409 body carries no message', () => {
    expect(deleteFailureMessage(conflict(undefined), t)).toContain('dezaktywuj klienta');
  });

  it('falls back to a Polish message when a 409 carries no body at all', () => {
    const error = new HttpErrorResponse({status: 409, statusText: 'Conflict', error: undefined});

    expect(deleteFailureMessage(error, t)).toContain('dezaktywuj klienta');
  });

  it('shows a generic message for any other failure', () => {
    const error = new HttpErrorResponse({status: 500, statusText: 'Server Error'});

    expect(deleteFailureMessage(error, t)).toBe('Nie udało się usunąć klienta. Spróbuj ponownie później.');
  });

  it('shows a generic message for a non-HTTP error', () => {
    expect(deleteFailureMessage(new Error('boom'), t)).toBe(
      'Nie udało się usunąć klienta. Spróbuj ponownie później.'
    );
  });
});
