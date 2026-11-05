import {CSV_COLUMNS} from './csv-columns';

/**
 * The column set and order are a contract (FR-028): the export is opened in the spreadsheets
 * the business already uses, so a renamed label, a reordered column or a dropped one breaks a
 * downstream process without an error. This spec pins the exact list transcribed from the
 * legacy `csv-file-headers.ts`, one entry at a time rather than by count, so a substitution
 * cannot pass.
 */
describe('CSV_COLUMNS', () => {
  it('is the legacy header set, in the legacy order', () => {
    expect(CSV_COLUMNS).toEqual([
      {label: 'Imie i nazwisko', key: 'name'},
      {label: 'Typ', key: 'type'},
      {label: 'Osoba kontaktowa', key: 'contactPerson'},
      {label: 'Telefon', key: 'phone'},
      {label: 'Email', key: 'email'},
      {label: 'Ulica', key: 'street'},
      {label: 'Miasto', key: 'city'},
      {label: 'Kod pocztowy', key: 'zipCode'},
      {label: 'NIP', key: 'nip'},
      {label: 'Lokalizacja', key: 'cityBooking'},
      {label: 'Budynek', key: 'building'},
      {label: 'Wynajmowana powierzchnia', key: 'size'},
      {label: 'Metoda płatności', key: 'payment'},
      {label: 'Udzielony Rabat', key: 'discount'},
      {label: 'Data', key: 'day'},
      {label: 'Godzina rozpoczęcia', key: 'startHour'},
      {label: 'Godzina zakończenia', key: 'endHour'},
      {label: 'Liczba uczestników', key: 'participants'},
      {label: 'Status', key: 'status'},
      {label: 'Dodatkowe opcje', key: 'extraOptions'},
      {label: 'Wybrane Opcje', key: 'selectedOptions'},
      {label: 'Od', key: 'startHourOption'},
      {label: 'Do', key: 'endHourOption'},
      {label: 'Dodatkowe informacje', key: 'message'},
    ]);
  });

  it('has a unique key for every column', () => {
    const keys = CSV_COLUMNS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
