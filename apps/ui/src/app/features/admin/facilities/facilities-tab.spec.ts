import {IBuilding} from '@models/building.model';
import {
  EMAIL_PATTERN,
  buildMessageRequest,
  employeeOptions,
  emptyEmployeeMessage,
  facilityDetails,
  sendFailureMessage,
  validateEmployeeMessage,
  yesNo,
} from './facilities-tab';
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
});
