import {COPY} from './copy';

/**
 * The copy catalogue's shape and its interpolating entries (NFR-005, T061).
 *
 * Most of the catalogue is data and is exercised by every UI spec that renders a screen. The
 * entries that are *functions* have behaviour — the bound or the name they interpolate — and a
 * function that drops its argument would still be a string, so each is asserted here.
 */
describe('copy catalogue', () => {
  it('interpolates the version into the footer meta line', () => {
    expect(COPY.footer.meta('1.2.3')).toBe(
      'Book Space — system rezerwacji · Wersja aplikacji 1.2.3'
    );
  });

  it('names the conflicting count in the bookings conflicts line', () => {
    expect(COPY.bookings.conflicts(3)).toContain('3');
  });

  it('names the day in the intra-booking overlap warning', () => {
    expect(COPY.bookingRequest.overlapWarning('2026-03-04')).toContain('2026-03-04');
  });

  it('names the client in the delete confirmation', () => {
    expect(COPY.clients.deleteConfirm('Firma sp. z o.o.')).toContain('Firma sp. z o.o.');
  });

  it('names the page and page count in the pagination status', () => {
    expect(COPY.shared.pagination.status(2, 10)).toBe('Strona 2 z 10');
  });

  it('names the account in the deactivate confirmation', () => {
    const text = COPY.users.deactivateConfirm('Jan', 'Kowalski');
    expect(text).toContain('Jan Kowalski');
  });

  it('interpolates the bounds into every parameterised validation message', () => {
    expect(COPY.validation.nameRange(3, 125)).toBe('Nazwa musi mieć od 3 do 125 znaków');
    expect(COPY.validation.nickRange(3, 100)).toContain('3');
    expect(COPY.validation.contactPersonRange(3, 125)).toContain('125');
    expect(COPY.validation.phoneRange(3, 15)).toContain('15');
    expect(COPY.validation.streetRange(3, 125)).toContain('125');
    expect(COPY.validation.cityRange(3, 125)).toContain('125');
    expect(COPY.validation.zipCodeRule(6)).toContain('6');
    expect(COPY.validation.nipRequired(10, 15)).toContain('10');
    expect(COPY.validation.passwordRange(6, 30)).toContain('30');
    expect(COPY.validation.firstNameRange(3, 125)).toContain('3');
    expect(COPY.validation.lastNameRange(3, 125)).toContain('125');
    expect(COPY.validation.personNameRange(3, 125)).toContain('125');
    expect(COPY.validation.personCompanyMax(125)).toContain('125');
    expect(COPY.validation.commentsMax(525)).toContain('525');
    expect(COPY.validation.emailRange(3, 125)).toContain('3');
  });

  it('carries the shared yes/no, save and cancel labels', () => {
    expect(COPY.common.yes).toBe('Tak');
    expect(COPY.common.no).toBe('Nie');
    expect(COPY.common.save).toBe('Zapisz');
    expect(COPY.common.cancel).toBe('Anuluj');
  });

  it('carries the value vocabularies the screens label', () => {
    expect(COPY.labels.clientType).toEqual({INDIVIDUAL: 'Osoba prywatna', COMPANY: 'Firma'});
    expect(COPY.labels.payment).toEqual({TRANSFER: 'Przelew', CASH: 'Gotówka', FREE: 'Bezpłatne'});
    expect(COPY.labels.role).toEqual({ADMIN: 'Administrator', OFFICE: 'Biuro', EMPLOYEE: 'Pracownik'});
  });

  it('gives every admin tab a label', () => {
    expect(Object.values(COPY.admin.tabs).every((label) => label.length > 0)).toBe(true);
  });

  it('carries the twelve-ish calendar month names and seven weekday labels', () => {
    expect(COPY.calendar.months).toHaveLength(12);
    expect(COPY.calendar.weekdays).toHaveLength(7);
  });
});
