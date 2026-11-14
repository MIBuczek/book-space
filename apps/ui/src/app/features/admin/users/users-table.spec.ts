import {IBuilding} from '@models/building.model';
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  NAME_MAX,
  buildCreateRequest,
  buildUpdateRequest,
  emptyUserForm,
  formFromUser,
  isCityRequired,
  mapServerErrors,
  toRow,
  validateUserForm,
} from './users-table';
import type {IUserFormValue} from './users-table';
import {cityOptions} from '../../../core/city-options';
import {testTranslate} from '../../../../testing/i18n-testing';

/**
 * The Users tab's pure logic (FR-045, FR-047).
 *
 * The form's rules are asserted against the server's `UserDto` field by field, so a value the
 * server would refuse is caught here first. The row shaping and the request building are the
 * parts a rendered table would otherwise only exercise incidentally.
 */

const form = (overrides: Partial<IUserFormValue> = {}): IUserFormValue => ({
  ...emptyUserForm(),
  firstName: 'Anna',
  lastName: 'Nowak',
  email: 'anna@example.com',
  password: 'secret1',
  recheckPassword: 'secret1',
  ...overrides,
});

const t = testTranslate();

describe('labels', () => {
  it('labels every role in Polish', () => {
    expect(ROLE_LABELS['ADMIN']).toBe('users.roleLabels.ADMIN');
    expect(ROLE_LABELS['OFFICE']).toBe('users.roleLabels.OFFICE');
    expect(ROLE_LABELS['EMPLOYEE']).toBe('users.roleLabels.EMPLOYEE');
  });

  it('offers every role as an option', () => {
    expect(ROLE_OPTIONS).toEqual(['ADMIN', 'OFFICE', 'EMPLOYEE']);
  });

  it('derives the city options from the facilities, in facility order', () => {
    const facilities = [
      {city: 'siechnice', name: 'Hala', property: 'hala-sportowa'},
      {city: 'radwanice', name: 'Hala', property: 'hala-sportowa'},
    ] as IBuilding[];
    expect(cityOptions(facilities)).toEqual([
      {value: 'siechnice', label: 'Siechnice'},
      {value: 'radwanice', label: 'Radwanice'},
    ]);
  });
});

describe('isCityRequired', () => {
  it('requires a city for an employee and an office user', () => {
    expect(isCityRequired('EMPLOYEE')).toBe(true);
    expect(isCityRequired('OFFICE')).toBe(true);
  });

  it('does not require a city for an administrator', () => {
    expect(isCityRequired('ADMIN')).toBe(false);
  });
});

describe('emptyUserForm', () => {
  it('starts at the least-privileged role and active', () => {
    expect(emptyUserForm()).toEqual({
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
  });
});

describe('formFromUser', () => {
  it('never prefills a password, because the API returns a hash', () => {
    const value = formFromUser({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.com',
      role: 'OFFICE',
      city: 'siechnice',
      buildings: ['hala-sportowa'],
      active: true,
    });
    expect(value.password).toBe('');
    expect(value.recheckPassword).toBe('');
    expect(value.city).toBe('siechnice');
    expect(value.buildings).toEqual(['hala-sportowa']);
  });

  it('defaults a missing city and assignment list rather than leaving them undefined', () => {
    const value = formFromUser({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.com',
      role: 'ADMIN',
      active: true,
    });
    expect(value.city).toBe('');
    expect(value.buildings).toEqual([]);
  });
});

describe('validateUserForm', () => {
  it('accepts a complete create form', () => {
    expect(validateUserForm(form({role: 'OFFICE', city: 'siechnice'}), false, t)).toEqual({});
  });

  it('requires a name of the server bound', () => {
    expect(validateUserForm(form({firstName: 'Al'}), false, t).firstName).toBeDefined();
  });

  it('rejects a name over the server maximum', () => {
    const long = 'a'.repeat(NAME_MAX + 1);
    expect(validateUserForm(form({firstName: long}), false, t).firstName).toBeDefined();
    expect(validateUserForm(form({lastName: long}), false, t).lastName).toBeDefined();
  });

  it('rejects a malformed e-mail', () => {
    expect(validateUserForm(form({email: 'not-an-email'}), false, t).email).toBeDefined();
    expect(validateUserForm(form({email: 'a@b'}), false, t).email).toBeDefined();
  });

  it('requires a password on create', () => {
    expect(validateUserForm(form({password: '', recheckPassword: ''}), false, t).password).toBeDefined();
  });

  it('does not require a password on edit, because blank means unchanged', () => {
    const errors = validateUserForm(form({password: '', recheckPassword: ''}), true, t);
    expect(errors.password).toBeUndefined();
  });

  it('requires the confirmation to match whenever a password is supplied', () => {
    expect(
      validateUserForm(form({password: 'secret1', recheckPassword: 'secret2'}), true, t).recheckPassword
    ).toBeDefined();
  });

  it('ignores the confirmation when no password is supplied on edit', () => {
    const errors = validateUserForm(form({password: '', recheckPassword: 'anything'}), true, t);
    expect(errors.recheckPassword).toBeUndefined();
  });

  it('requires a city for a non-administrator and not for an administrator', () => {
    expect(validateUserForm(form({role: 'OFFICE', city: ''}), false, t).city).toBeDefined();
    expect(validateUserForm(form({role: 'ADMIN', city: ''}), false, t).city).toBeUndefined();
  });
});

describe('buildCreateRequest', () => {
  it('includes the city for a non-administrator and omits it for an administrator', () => {
    expect(buildCreateRequest(form({role: 'OFFICE', city: 'siechnice'})).city).toBe('siechnice');
    expect(buildCreateRequest(form({role: 'ADMIN'}))).not.toHaveProperty('city');
  });

  it('omits an empty assignment list', () => {
    expect(buildCreateRequest(form({buildings: []}))).not.toHaveProperty('buildings');
    expect(buildCreateRequest(form({buildings: ['hala-sportowa']})).buildings).toEqual([
      'hala-sportowa',
    ]);
  });

  it('always includes the password pair', () => {
    const request = buildCreateRequest(form());
    expect(request.password).toBe('secret1');
    expect(request.recheckPassword).toBe('secret1');
  });
});

describe('buildUpdateRequest', () => {
  it('omits the password pair when the field is blank, so the stored hash is unchanged', () => {
    const request = buildUpdateRequest(form({password: '', recheckPassword: ''}));
    expect(request).not.toHaveProperty('password');
    expect(request).not.toHaveProperty('recheckPassword');
  });

  it('includes the password pair when a new password is typed', () => {
    const request = buildUpdateRequest(form({password: 'newpass', recheckPassword: 'newpass'}));
    expect(request.password).toBe('newpass');
    expect(request.recheckPassword).toBe('newpass');
  });

  it('omits the city for an administrator and the empty assignment list', () => {
    const request = buildUpdateRequest(form({role: 'ADMIN', buildings: []}));
    expect(request).not.toHaveProperty('city');
    expect(request).not.toHaveProperty('buildings');
  });
});

describe('mapServerErrors', () => {
  it('matches a message to the field it names', () => {
    const {fields, general} = mapServerErrors(['E-mail address need to contains correct pattern.'], t);
    expect(fields.email).toBeDefined();
    expect(general).toBeNull();
  });

  it('matches a password confirmation message to the confirmation field, not the password', () => {
    const {fields} = mapServerErrors(['Passwords not match each other'], t);
    expect(fields.recheckPassword).toBeDefined();
    expect(fields.password).toBeUndefined();
  });

  it('returns the generic prompt for a message that names no field', () => {
    const {fields, general} = mapServerErrors(['Role must be one of ADMIN, OFFICE, EMPLOYEE.'], t);
    expect(fields).toEqual({});
    expect(general).toBe('Popraw dane i spróbuj ponownie.');
  });

  it('shows one generic prompt for several unmatched messages', () => {
    const {general} = mapServerErrors(['Role is not allowed', 'Please try again'], t);
    expect(general).toBe('Popraw dane i spróbuj ponownie.');
  });
});

describe('toRow', () => {
  it('shapes an active office account', () => {
    const row = toRow({
      _id: 'u1',
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.com',
      role: 'OFFICE',
      city: 'siechnice',
      active: true,
    }, t);
    expect(row['name']).toBe('Anna Nowak');
    expect(row['roleLabel']).toBe('Biuro');
    expect(row['cityLabel']).toBe('siechnice');
    expect(row['activeLabel']).toBe('Aktywne');
  });

  it('shows a dash for an administrator with no city and a deactivated status', () => {
    const row = toRow({
      _id: 'u1',
      firstName: 'Ada',
      lastName: 'Admin',
      email: 'ada@example.com',
      role: 'ADMIN',
      active: false,
    }, t);
    expect(row['cityLabel']).toBe('—');
    expect(row['activeLabel']).toBe('Nieaktywne');
  });
});
