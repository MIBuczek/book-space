import {HttpErrorResponse} from '@angular/common/http';
import {IBuilding} from '@models/building.model';
import {
  EMAIL_PATTERN,
  buildFacilityRequest,
  buildMessageRequest,
  deleteFailureMessage,
  employeeOptions,
  emptyEmployeeMessage,
  emptyFacilityForm,
  facilityDetails,
  formFromFacility,
  mapFacilityServerErrors,
  parseEmployees,
  sendFailureMessage,
  validateEmployeeMessage,
  validateFacilityForm,
  yesNo,
} from './facilities-tab';
import type {IFacilityFormValue} from './facilities-tab';
import {testTranslate} from '../../../../testing/i18n-testing';

const facility = (overrides: Partial<IBuilding> = {}): IBuilding => ({
  _id: 'b1',
  name: 'Hala sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/1', '1/2'],
  lighting: true,
  toilets: false,
  email: 'siechnice.hala@gmail.com',
  phone: '609 996 064',
  employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  ...overrides,
});

const t = testTranslate();

describe('facilities tab logic', () => {
  it('labels a boolean flag in Polish', () => {
    expect(t(yesNo(true))).toBe('Tak');
    expect(t(yesNo(false))).toBe('Nie');
  });

  describe('facilityDetails', () => {
    it('returns no rows for an absent facility, so no compiled-in default can leak in', () => {
      expect(facilityDetails(null, t)).toEqual([]);
    });

    it('describes the facility with its contact details, sizes and flags (FR-009)', () => {
      expect(facilityDetails(facility(), t)).toEqual([
        {label: 'Miejscowość', value: 'Siechnice'},
        {label: 'Nazwa obiektu', value: 'Hala sportowa'},
        {label: 'Telefon kontaktowy', value: '609 996 064'},
        {label: 'E-mail', value: 'siechnice.hala@gmail.com'},
        {label: 'Powierzchnie', value: '1/1, 1/2'},
        {label: 'Oświetlenie', value: 'Tak'},
        {label: 'Toalety', value: 'Nie'},
        {label: 'Status', value: 'Aktywny'},
      ]);
    });

    it('marks a retired facility and reads an absent flag as active (T059)', () => {
      expect(facilityDetails(facility({active: false}), t)).toContainEqual({
        label: 'Status',
        value: 'Nieaktywny',
      });
      expect(facilityDetails(facility({active: undefined}), t)).toContainEqual({
        label: 'Status',
        value: 'Aktywny',
      });
    });
  });

  describe('employeeOptions', () => {
    it('offers no employees for an absent facility', () => {
      expect(employeeOptions(null)).toEqual([]);
    });

    it('offers each employee as a value/label pair in the stored order', () => {
      expect(employeeOptions(facility())).toEqual([
        {value: 'Bożena Kaczyńska', label: 'Bożena Kaczyńska'},
        {value: 'Beata Hasiuk', label: 'Beata Hasiuk'},
      ]);
    });
  });

  describe('emptyEmployeeMessage', () => {
    it('pre-fills the facility address and the first employee', () => {
      expect(emptyEmployeeMessage(facility())).toEqual({
        person: 'Bożena Kaczyńska',
        recipient: 'siechnice.hala@gmail.com',
        message: '',
      });
    });

    it('is empty for an absent facility', () => {
      expect(emptyEmployeeMessage(null)).toEqual({person: '', recipient: '', message: ''});
    });
  });

  describe('validateEmployeeMessage', () => {
    const valid = {person: 'Beata Hasiuk', recipient: 'beata@example.com', message: 'Dzień dobry'};

    it('accepts a complete message', () => {
      expect(validateEmployeeMessage(valid, t)).toEqual({});
    });

    it('requires an employee', () => {
      expect(validateEmployeeMessage({...valid, person: '   '}, t)).toEqual({
        person: 'Wybierz pracownika',
      });
    });

    it('requires a well-formed recipient address', () => {
      expect(validateEmployeeMessage({...valid, recipient: 'not-an-email'}, t)).toEqual({
        recipient: 'Podaj poprawny adres e-mail',
      });
    });

    it('requires a message body', () => {
      expect(validateEmployeeMessage({...valid, message: '  '}, t)).toEqual({
        message: 'Wiadomość nie może być pusta',
      });
    });

    it('matches the server, which refuses an address with no dotted domain', () => {
      expect(EMAIL_PATTERN.test('a@b')).toBe(false);
      expect(EMAIL_PATTERN.test('a@b.pl')).toBe(true);
    });
  });

  describe('buildMessageRequest', () => {
    it('sends the facility address as the sender and the employee as the recipient (FR-041)', () => {
      expect(
        buildMessageRequest(
          {person: 'Beata Hasiuk', recipient: 'beata@example.com', message: 'Dzień dobry'},
          facility()
        )
      ).toEqual({
        person: 'Beata Hasiuk',
        email: 'siechnice.hala@gmail.com',
        message: 'Dzień dobry',
        recipient: 'beata@example.com',
      });
    });

    it('sends an empty sender for an absent facility rather than inventing one', () => {
      expect(
        buildMessageRequest({person: 'X', recipient: 'x@example.com', message: 'Hi'}, null)
      ).toEqual({person: 'X', email: '', message: 'Hi', recipient: 'x@example.com'});
    });
  });

  describe('sendFailureMessage', () => {
    it('shows a Polish prompt for a 422, not the server\'s English field message (T061)', () => {
      expect(sendFailureMessage(422, t)).toBe('Popraw dane i spróbuj ponownie.');
    });

    it('shows a retry message for a provider failure (FR-036)', () => {
      expect(sendFailureMessage(502, t)).toBe(
        'Nie udało się wysłać wiadomości. Spróbuj ponownie później.'
      );
    });
  });

  describe('facility form (T272)', () => {
    const valid: IFacilityFormValue = {
      name: 'Hala sportowa',
      property: 'hala-sportowa',
      city: 'siechnice',
      email: 'hala@example.com',
      phone: '609 996 064',
      street: '',
      zipCode: '',
      sizes: ['1/1', '1/2'],
      lighting: true,
      toilets: false,
      employees: '',
      active: true,
    };

    describe('emptyFacilityForm', () => {
      it('starts blank, with no size chosen and active by default', () => {
        expect(emptyFacilityForm()).toEqual({
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
      });
    });

    describe('formFromFacility', () => {
      it('reads the stored record, joining employees one per line', () => {
        expect(formFromFacility(facility({street: 'ul. Sienkiewicza 1', zipCode: '55-010'}))).toEqual({
          name: 'Hala sportowa',
          property: 'hala-sportowa',
          city: 'siechnice',
          email: 'siechnice.hala@gmail.com',
          phone: '609 996 064',
          street: 'ul. Sienkiewicza 1',
          zipCode: '55-010',
          sizes: ['1/1', '1/2'],
          lighting: true,
          toilets: false,
          employees: 'Bożena Kaczyńska\nBeata Hasiuk',
          active: true,
        });
      });

      it('reads an absent address and flag as empty and active (T059)', () => {
        const value = formFromFacility(facility({street: undefined, zipCode: undefined, active: undefined}));
        expect(value.street).toBe('');
        expect(value.zipCode).toBe('');
        expect(value.active).toBe(true);
      });
    });

    describe('validateFacilityForm', () => {
      it('accepts a complete facility', () => {
        expect(validateFacilityForm(valid, t)).toEqual({});
      });

      it('requires a name within the server bound', () => {
        expect(validateFacilityForm({...valid, name: 'ab'}, t).name).toBe(
          'Nazwa musi mieć od 3 do 125 znaków'
        );
      });

      it('requires a facility key', () => {
        expect(validateFacilityForm({...valid, property: '   '}, t).property).toBe(
          'Klucz obiektu jest wymagany'
        );
      });

      it('requires a well-formed e-mail, distinguishing empty from malformed', () => {
        expect(validateFacilityForm({...valid, email: ''}, t).email).toBe('E-mail jest wymagany');
        expect(validateFacilityForm({...valid, email: 'nope'}, t).email).toBe(
          'Podaj poprawny adres e-mail'
        );
      });

      it('bounds the phone and the city', () => {
        expect(validateFacilityForm({...valid, phone: '12'}, t).phone).toBe(
          'Telefon musi mieć od 3 do 15 znaków'
        );
        expect(validateFacilityForm({...valid, city: 'x'}, t).city).toBe(
          'Miasto musi mieć od 2 do 125 znaków'
        );
      });

      it('accepts an empty optional address but validates a present one', () => {
        expect(validateFacilityForm({...valid, street: '', zipCode: ''}, t)).toEqual({});
        expect(validateFacilityForm({...valid, street: 'ab'}, t).street).toBe(
          'Ulica musi mieć od 3 do 125 znaków'
        );
        expect(validateFacilityForm({...valid, zipCode: '123'}, t).zipCode).toBe(
          'Kod pocztowy musi mieć 6 znaków (cyfry, kropki, ukośniki, myślniki)'
        );
      });

      it('accepts a well-formed optional address', () => {
        expect(validateFacilityForm({...valid, street: 'ul. Testowa 1', zipCode: '55-010'}, t)).toEqual({});
      });

      it('requires at least one rentable size (FR-008)', () => {
        expect(validateFacilityForm({...valid, sizes: []}, t).sizes).toBe(
          'Wybierz co najmniej jedną powierzchnię'
        );
      });
    });

    describe('parseEmployees', () => {
      it('splits on newlines, trims and drops blank lines', () => {
        expect(parseEmployees('  Anna \n\n Piotr  \n')).toEqual(['Anna', 'Piotr']);
      });

      it('returns an empty list for empty input', () => {
        expect(parseEmployees('   \n  ')).toEqual([]);
      });
    });

    describe('buildFacilityRequest', () => {
      it('sends the required fields and omits empty optionals', () => {
        expect(buildFacilityRequest(valid)).toEqual({
          name: 'Hala sportowa',
          property: 'hala-sportowa',
          city: 'siechnice',
          email: 'hala@example.com',
          phone: '609 996 064',
          sizes: ['1/1', '1/2'],
          lighting: true,
          toilets: false,
          employees: [],
          active: true,
        });
      });

      it('includes a present optional address and parses employees', () => {
        expect(
          buildFacilityRequest({...valid, street: 'ul. 1', zipCode: '55-010', employees: 'Anna\nPiotr'})
        ).toMatchObject({
          street: 'ul. 1',
          zipCode: '55-010',
          employees: ['Anna', 'Piotr'],
        });
      });
    });

    describe('mapFacilityServerErrors', () => {
      it('maps a named field message to that field with the UI wording', () => {
        expect(mapFacilityServerErrors(['Property need to be filled.'], t)).toEqual({
          fields: {property: 'Nieprawidłowa wartość.'},
          general: null,
        });
      });

      it('maps the server\'s hyphenated E-mail spelling to the email field', () => {
        expect(mapFacilityServerErrors(['E-mail address need to contains correct pattern'], t).fields).toEqual(
          {email: 'Nieprawidłowa wartość.'}
        );
      });

      it('maps a size message to the sizes field', () => {
        expect(mapFacilityServerErrors(['Size must be one of 1/1, 1/2, 1/3, 2/3, 1/4, 3/4.'], t).fields).toEqual(
          {sizes: 'Nieprawidłowa wartość.'}
        );
      });

      it('falls back to the general prompt for a message that names no field', () => {
        expect(mapFacilityServerErrors(['Number of characters need to be between 3 and 125'], t)).toEqual({
          fields: {},
          general: 'Popraw dane i spróbuj ponownie.',
        });
      });
    });

    describe('deleteFailureMessage', () => {
      it('names the conflict on a 409 and points at deactivation', () => {
        const error = new HttpErrorResponse({status: 409});
        expect(deleteFailureMessage(error, t)).toContain('Nie można usunąć obiektu');
      });

      it('shows a retry message for any other failure', () => {
        expect(deleteFailureMessage(new HttpErrorResponse({status: 500}), t)).toBe(
          'Nie udało się usunąć obiektu. Spróbuj ponownie później.'
        );
        expect(deleteFailureMessage(new Error('offline'), t)).toBe(
          'Nie udało się usunąć obiektu. Spróbuj ponownie później.'
        );
      });
    });
  });
});
