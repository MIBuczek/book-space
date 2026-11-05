import {ICSVColumn} from '@models/reporting.model';

/**
 * The CSV column set and order, transcribed verbatim from the legacy
 * `csv-file-headers.ts` (FR-028). This is a contract, not an implementation detail: the
 * exported file is opened in the spreadsheets the business already uses, so a renamed label,
 * a reordered column or a dropped one breaks a downstream process silently. `csv-columns.spec.ts`
 * pins the list so a change has to be deliberate.
 *
 * The labels are Polish and are not translated — the file is a business artefact, not a UI
 * string. The keys are internal and name the source field; several labels map to keys that are
 * deliberately distinct (`city` is the client's city, `cityBooking` the booking's facility city;
 * `building` is the facility key).
 */
const CSV_COLUMNS: ICSVColumn[] = [
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
];

export {CSV_COLUMNS};
