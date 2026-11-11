/**
 * The single catalogue of user-facing Polish copy (NFR-005, T061).
 *
 * NFR-005 requires every user-facing string to be Polish and to be centralised so it can be
 * translated later. This module is that single source: the Angular UI reads its labels, titles,
 * aria-labels, notices and validation messages from here, and a spec fails if a component
 * reintroduces a Polish literal of its own (`no-hardcoded-copy.spec.ts`).
 *
 * ## Key convention
 *
 * Keys are grouped by the surface that renders them, one group per feature: `nav`, `footer`,
 * `admin`, `calendar`, `bookingRequest`, `bookings`, `clients`, `users`, `facilities`, `summary`,
 * `signIn`, `contact`, `cookieNotice`, `notFound`, `serverError`, plus the shared `common`,
 * `errors`, `validation` and `labels` groups. Within a group the key names the element
 * (`title`, `empty`, `loading`, `fields.email`, `columns.name`). A key names an *element*, never a
 * value, so the Polish text can change without the code changing.
 *
 * ## What is deliberately *not* here
 *
 * - **City labels** (`CITY_LABELS` in `libs/models/building.model.ts`). They are a shared model
 *   constant beside `CITIES`, and the server validates against `CITIES`; the catalogue is the
 *   UI's copy, not the model's vocabulary.
 * - **CSV column labels** (`apps/server/src/app/reporting/csv/csv-columns.ts`) and **notification
 *   subjects/bodies** (`apps/server/src/app/notification/templates/templates.ts`). These are
 *   server-side business artefacts, not UI strings: the CSV is opened in a spreadsheet and the
 *   e-mail is read by staff and facilities, neither of which runs the Angular bundle. Each is
 *   already a single, spec-pinned home, and a copy in the UI could not reach them.
 * - **Report vocabulary** (`@booking/reporting`), which the printable report and the CSV share so
 *   the two artefacts cannot disagree.
 *
 * ## API error localisation
 *
 * The API is English (NFR-005). The UI therefore never renders the API's `message` text: it maps
 * the HTTP status and the field a message names to the `errors` group below, so a user never sees
 * English, and the `message` the server sends is used only to *locate* the field, not to display
 * it.
 */

/** A shared, parameterless label used by more than one surface. */
const COMMON = {
  yes: 'Tak',
  no: 'Nie',
  save: 'Zapisz',
  cancel: 'Anuluj',
  edit: 'Edytuj',
  remove: 'Usuń',
  close: 'Zamknij',
  pageSize: 'Na stronę',
  phonePrefix: 'tel. ',
  dash: '—',
  noValue: '[Brak]',
  backToCalendar: 'Powrót do kalendarza rezerwacji',
} as const;

/** The top navigation (FR-039). */
const NAV = {
  ariaLabel: 'Nawigacja',
  calendar: 'Kalendarz',
  bookingRequest: 'Rezerwacja',
  contact: 'Kontakt',
  admin: 'Administracja',
  signIn: 'Zaloguj',
  signOut: 'Wyloguj',
} as const;

/** The footer (FR-039). */
const FOOTER = {
  ariaLabel: 'Informacje',
  privacy: 'Polityka prywatności',
  site: 'Strona SISK',
  meta: (version: string): string =>
    `SISK Siechnice — system rezerwacji · Wersja aplikacji ${version}`,
} as const;

/** The admin shell, its tabs and the placeholder body (FR-004). */
const ADMIN = {
  sectionsAria: 'Sekcje panelu',
  signOut: 'Wyloguj',
  tabs: {
    calendar: 'Kalendarz',
    bookings: 'Rezerwacje',
    clients: 'Najemcy',
    facilities: 'Obiekty',
    summary: 'Podsumowanie',
    users: 'Użytkownicy',
  },
  placeholder: {
    title: 'Administracja',
    body: 'Ta sekcja jest w budowie (T036–T039).',
  },
} as const;

/** The public calendar (FR-037, FR-038). */
const CALENDAR = {
  title: 'Kalendarz rezerwacji obiektów',
  city: 'Miasto',
  facility: 'Obiekt',
  facilityPlaceholder: 'Wybierz obiekt',
  viewAria: 'Widok',
  views: {week: 'Tydzień', day: 'Dzień', list: 'Lista', month: 'Miesiąc'},
  previous: 'Poprzedni',
  today: 'Dzisiaj',
  next: 'Następny',
  chooseFacility: 'Wybierz obiekt, aby zobaczyć kalendarz.',
  loading: 'Wczytywanie rezerwacji…',
  loadError: 'Nie udało się wczytać rezerwacji.',
  empty: 'Brak rezerwacji w wybranym okresie.',
  detailsAria: 'Szczegóły rezerwacji',
  detailsTitle: 'Szczegóły rezerwacji',
  fields: {name: 'Nazwa', day: 'Dzień', hours: 'Godziny', size: 'Rozmiar', status: 'Status'},
  staffFields: {client: 'Klient', email: 'E-mail', phone: 'Telefon'},
  defaultLabel: 'Rezerwacja',
  status: {done: 'Zakończona', accepted: 'Zatwierdzona', pending: 'Oczekująca'},
  weekdays: ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nie'],
  months: [
    'styczeń',
    'luty',
    'marzec',
    'kwiecień',
    'maj',
    'czerwiec',
    'lipiec',
    'sierpień',
    'wrzesień',
    'październik',
    'listopad',
    'grudzień',
  ],
  publicNotice: 'W kalendarzu są widoczne tylko zatwierdzone przez administratora rezerwacje.',
} as const;

/** The public booking request form (FR-011–FR-013). */
const BOOKING_REQUEST = {
  title: 'Prośba o rezerwację',
  success: 'Dziękujemy. Twoja prośba o rezerwację została wysłana i oczekuje na zatwierdzenie.',
  legends: {
    facility: 'Obiekt',
    requester: 'Rezerwujący',
    slots: 'Terminy',
    extras: 'Dodatkowe opcje wynajmu',
  },
  city: 'Miasto',
  facility: 'Obiekt',
  facilityPlaceholder: 'Wybierz obiekt',
  size: 'Rozmiar',
  type: 'Typ',
  nick: 'Nazwa w kalendarzu',
  personName: 'Imię i nazwisko',
  personCompany: 'Nazwa firmy',
  email: 'E-mail',
  phone: 'Telefon',
  payment: 'Płatność',
  discount: 'Rabat (opcjonalnie)',
  comments: 'Dodatkowe informacje',
  day: 'Dzień',
  fromHour: 'Od godziny',
  toHour: 'Do godziny',
  addSlot: 'Dodaj termin',
  cyclical: 'Rezerwacja cykliczna',
  untilDay: 'Do dnia',
  noSlots: 'Nie dodano jeszcze żadnego terminu.',
  removeLastSlot: 'Usuń ostatni termin',
  overlapWarning: (day: string): string =>
    `Niektóre godziny rezerwacji konfliktują ze sobą (${day}).`,
  lights: 'Oświetlenie',
  toilets: 'Zaplecze sanitarne',
  addExtra: 'Dodaj opcję',
  noExtras: 'Nie dodano żadnych dodatkowych opcji.',
  rodo: 'Akceptuję klauzulę informacyjną RODO',
  rodoLink: 'Klauzula informacyjna o przetwarzaniu danych osobowych.',
  website: 'Strona internetowa',
  submit: 'Wyślij prośbę o rezerwację',
  endBeforeStart: 'Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.',
  seriesBackwards: 'Data zakończenia serii nie może być wcześniejsza niż jej początek.',
  chooseFacility: 'Wybierz obiekt.',
  sendValidation: 'Nie udało się wysłać prośby. Sprawdź dane i spróbuj ponownie.',
  sendGeneric: 'Nie udało się wysłać prośby. Spróbuj ponownie później.',
} as const;

/** The admin bookings tab (FR-017, FR-018, FR-020–FR-022). */
const BOOKINGS = {
  title: 'Lista rezerwacji',
  city: 'Miasto',
  facility: 'Obiekt',
  facilityPlaceholder: 'Wybierz obiekt',
  period: 'Okres',
  search: 'Wyszukaj rezerwację',
  unapproved: 'Pokaż rezerwacje do zaakceptowania',
  showDetails: 'Pokaż szczegóły rezerwacji',
  chooseFacility: 'Wybierz obiekt, aby zobaczyć rezerwacje.',
  loading: 'Wczytywanie rezerwacji…',
  loadError: 'Nie udało się wczytać rezerwacji.',
  caption: 'Rezerwacje',
  empty: 'Nie ma żadnej rezerwacji w bazie danych.',
  details: {tenant: 'Najemca:', club: 'Klub:', payment: 'Płatność:', message: 'Wiadomość:'},
  slotColumns: {
    day: 'Dzień',
    hours: 'Godziny',
    status: 'Status',
    participants: 'Uczestnicy',
    actions: 'Akcje',
  },
  resolvedSlot: 'Slot rozliczony',
  reschedule: 'Przenieś',
  resolve: 'Rozlicz',
  approve: 'Zatwierdź',
  unapprove: 'Odwołaj',
  archive: 'Archiwizuj',
  unarchive: 'Przywróć',
  conflicts: (count: number): string =>
    `Aktualna liczba konfliktów między rezerwacjami: ${count}`,
  approveWarning: 'Rezerwacja konfliktuje z innymi rezerwacjami. Czy chcesz ją zatwierdzić mimo to?',
  approveAnyway: 'Zatwierdź mimo konfliktu',
  modals: {
    reschedule: 'Przenieś slot',
    resolve: 'Rozlicz slot',
    edit: 'Edytuj rezerwację',
    delete: 'Usuń rezerwację',
  },
  deleteConfirm: 'Czy na pewno chcesz usunąć tą rezerwację?',
  fields: {nick: 'Nazwa w kalendarzu', personName: 'Imię i nazwisko', phone: 'Telefon'},
  resolveFields: {status: 'Status', participants: 'Uczestnicy', comments: 'Komentarz'},
  hours: {from: 'Od', to: 'Do'},
  columns: {
    nick: 'Nazwa klienta',
    personPhone: 'Telefon',
    personEmail: 'E-mail',
    accepted: 'Zakceptowana',
    conflict: 'Konflikty',
  },
  statusLabels: {INITIAL: 'Początkowa', DONE: 'Zakończona', CANCELED: 'Anulowana'},
  fromBeginning: 'Od początku',
  conflict: 'Konflikt',
  notifyApplicant: 'Powiadom wnioskującego',
  notifySent: 'Powiadomienie zostało wysłane do wnioskującego.',
  notifyFailure: 'Nie udało się wysłać powiadomienia. Spróbuj ponownie później.',
} as const;

/** The admin clients tab (FR-024–FR-026). */
const CLIENTS = {
  title: 'Lista klientów',
  search: 'Wyszukaj klienta',
  add: 'Dodaj klienta',
  loading: 'Wczytywanie klientów…',
  loadError: 'Nie udało się wczytać klientów.',
  caption: 'Klienci',
  empty: 'Nie ma żadnego klienta w bazie danych.',
  editTitle: 'Edytuj klienta',
  createTitle: 'Dodaj klienta',
  deleteTitle: 'Usuń klienta',
  deleteConfirm: (name: string): string => `Czy na pewno chcesz usunąć klienta ${name}?`,
  fields: {
    type: 'Typ',
    nameCompany: 'Nazwa firmy',
    namePerson: 'Imię i nazwisko',
    nick: 'Nazwa w kalendarzu (opcjonalnie)',
    contactPerson: 'Osoba kontaktowa',
    phone: 'Telefon',
    email: 'E-mail',
    street: 'Ulica',
    city: 'Miasto',
    zipCode: 'Kod pocztowy',
    nip: 'NIP',
    active: 'Klient aktywny',
  },
  typeLabels: {INDIVIDUAL: 'Osoba prywatna', COMPANY: 'Firma'},
  columns: {
    name: 'Nazwa',
    contactPerson: 'Osoba kontaktowa',
    phone: 'Telefon',
    email: 'E-mail',
    city: 'Miasto',
    status: 'Status',
  },
  active: {yes: 'Aktywny', no: 'Nieaktywny'},
  deleteConflict:
    'Nie można usunąć tego klienta, ponieważ odwołuje się do niego rezerwacja. Zamiast tego dezaktywuj klienta.',
  deleteFailure: 'Nie udało się usunąć klienta. Spróbuj ponownie później.',
  saveFailure: 'Nie udało się zapisać klienta. Spróbuj ponownie później.',
} as const;

/** The admin users tab (FR-045, FR-047). */
const USERS = {
  title: 'Użytkownicy',
  add: 'Dodaj użytkownika',
  loading: 'Wczytywanie użytkowników…',
  loadError: 'Nie udało się wczytać użytkowników.',
  caption: 'Użytkownicy',
  empty: 'Nie ma żadnego użytkownika w bazie danych.',
  editTitle: 'Edytuj użytkownika',
  createTitle: 'Dodaj użytkownika',
  deactivateTitle: 'Dezaktywuj użytkownika',
  deactivate: 'Dezaktywuj',
  deactivateConfirm: (firstName: string, lastName: string): string =>
    `Czy na pewno chcesz dezaktywować konto ${firstName} ${lastName}? Konto nie będzie mogło się zalogować, ale pozostanie widoczne w historii rezerwacji.`,
  fields: {
    firstName: 'Imię',
    lastName: 'Nazwisko',
    email: 'E-mail',
    password: 'Hasło',
    recheckPassword: 'Powtórz hasło',
    role: 'Rola',
    city: 'Miasto',
    active: 'Konto aktywne',
  },
  passwordPlaceholderEdit: 'Zostaw puste, aby nie zmieniać',
  assignmentsLegend: 'Przypisane obiekty',
  columns: {
    name: 'Imię i nazwisko',
    email: 'E-mail',
    role: 'Rola',
    city: 'Miasto',
    status: 'Status',
  },
  roleLabels: {ADMIN: 'Administrator', OFFICE: 'Biuro', EMPLOYEE: 'Pracownik'},
  active: {yes: 'Aktywne', no: 'Nieaktywne'},
  saveFailure: 'Nie udało się zapisać użytkownika. Spróbuj ponownie później.',
  deactivateConflict: 'Nie można dezaktywować tego konta.',
  deactivateFailure: 'Nie udało się dezaktywować konta. Spróbuj ponownie później.',
} as const;

/** The admin facilities tab (FR-009, FR-041). */
const FACILITIES = {
  title: 'Obiekty sportowe',
  city: 'Miejscowość',
  facility: 'Obiekt',
  loading: 'Wczytywanie obiektów…',
  loadError: 'Nie udało się wczytać obiektów.',
  detailsHeading: 'Dane o obiekcie',
  detailsAria: 'Dane o obiekcie',
  employeesHeading: 'Pracownicy',
  employeesAria: 'Pracownicy',
  employeesCaption: 'Pracownicy',
  employeesEmpty: 'Ten obiekt nie ma przypisanych pracowników.',
  employeeColumn: 'Pracownik',
  messageAction: 'Wiadomość',
  messageHeading: 'Wyślij wiadomość pracownikowi',
  messageAria: 'Wyślij wiadomość pracownikowi',
  messagePerson: 'Pracownik',
  messageEmail: 'E-mail',
  messageBody: 'Wiadomość',
  send: 'Wyślij',
  noFacilities: 'Nie ma obiektów w tej miejscowości.',
  sent: 'Wiadomość została wysłana pomyślnie',
  sendValidation: 'Popraw dane i spróbuj ponownie.',
  sendFailure: 'Nie udało się wysłać wiadomości. Spróbuj ponownie później.',
  details: {
    city: 'Miejscowość',
    name: 'Nazwa obiektu',
    phone: 'Telefon kontaktowy',
    email: 'E-mail',
    sizes: 'Powierzchnie',
    lighting: 'Oświetlenie',
    toilets: 'Toalety',
    status: 'Status',
  },
  active: {yes: 'Aktywny', no: 'Nieaktywny'},
} as const;

/** The admin summary tab (FR-027–FR-030). */
const SUMMARY = {
  title: 'Podsumowanie najmów',
  client: 'Wybrany klient',
  clientPlaceholder: 'Wybierz',
  fromMonth: 'Od miesiąca',
  toMonth: 'Do miesiąca',
  fromBeginning: 'Podsumowanie od początku',
  generate: 'Generuj podsumowanie',
  clear: 'Wyczyść',
  downloadAll: 'Pobierz raport wszystkich klientów [.csv]',
  loading: 'Wczytywanie podsumowania…',
  loadError: 'Nie udało się wygenerować podsumowania.',
  reportAria: 'Raport podsumowania',
  reportTitle: 'Raport najmów za okres',
  empty: 'Aby zobaczyć podsumowanie, wybierz klienta oraz miesiąc.',
  downloadClient: 'Pobierz plik [.csv]',
  print: 'Wyświetl szczegóły [.pdf]',
  booking: {
    building: 'Budynek',
    size: 'Wynajmowana powierzchnia',
    discount: 'Udzielony rabat',
    payment: 'Metoda płatności',
    extraOptions: 'Dodatkowe opcje',
    selectedOptions: 'Wybrane opcje',
    comments: 'Dodatkowe informacje',
  },
  slot: {
    day: 'Dzień',
    hours: 'Godziny',
    participants: 'Liczba uczestników',
    status: 'Status',
    comments: 'Uwagi',
  },
  rangeError: {
    missing: 'Wybierz miesiąc początkowy i końcowy.',
    inverted: 'Miesiąc początkowy nie może być późniejszy niż końcowy.',
  },
  fromBeginningText: 'od początku',
  clientDetail: {
    name: 'Imię i nazwisko',
    type: 'Typ',
    contactPerson: 'Osoba kontaktowa',
    phone: 'Telefon',
    email: 'E-mail',
    street: 'Ulica',
    city: 'Miasto',
    zipCode: 'Kod pocztowy',
    nip: 'NIP',
    nick: 'Nick',
  },
  csvFilename: {clientFallback: 'Raport clienta.csv', all: 'Wszyscy klienci'},
} as const;

/** The sign-in page (FR-002). */
const SIGN_IN = {
  title: 'Zaloguj się',
  email: 'E-mail',
  password: 'Hasło',
  submit: 'Zaloguj się',
  invalid: 'Nieprawidłowy e-mail lub hasło',
  genericFailure: 'Logowanie nie powiodło się. Spróbuj ponownie.',
} as const;

/** The informational pages and the footer's contact block (FR-039). */
const CONTACT = {
  registeredOfficeHeading: 'Dane teleadresowe',
  hoursHeading: 'Godziny przyjęć interesantów:',
  officeHeading: 'Biuro / Adres korespondencyjny',
  bookingHeading: 'Osoba do kontaktu w sprawie rezerwacji',
  registeredOffice: {
    name: 'Siechnicka Inwestycyjna Spółka Komunalna sp. z o.o.',
    address: 'ul. Jana Pawła II 12, 55-011 Siechnice',
  },
  office: {
    address: 'ul. Księżnej Anny z Przemyślidów 6a, 55-011 Siechnice',
    phone: '71 889 00 23',
    phoneHref: 'tel:+48718890023',
    email: 'biuro@sisk-siechnice.pl',
    website: 'www.sisk-siechnice.pl',
    websiteHref: 'https://www.sisk-siechnice.pl/',
  },
  bookingContact: {
    name: 'Michał Hoffman',
    role: 'Kierownik obsługi obiektów sportowych i rekreacyjnych',
    phone: '691 113 592',
    phoneHref: 'tel:+48691113592',
    email: 'michal.hoffman@sisk-siechnice.pl',
  },
  hours: [
    {day: 'poniedziałek', hours: '08:00 - 14:00'},
    {day: 'wtorek', hours: '08:00 - 14:00'},
    {day: 'środa', hours: '08:00 - 14:00'},
    {day: 'czwartek', hours: '08:00 - 16:00'},
    {day: 'piątek', hours: '08:00 - 14:00'},
  ],
  privacyPolicyUrl: 'https://www.sisk-siechnice.pl/polityka-prywatnosci',
  siskWebsiteUrl: 'https://www.sisk-siechnice.pl/',
  rodoClauseUrl:
    'https://www.sisk-siechnice.pl/wp-content/uploads/2019/09/Klauzula-informacyjna-do-formularza-kontaktowego-SISK.pdf',
} as const;

/** The cookie notice (FR-039, FR-040). */
const COOKIE_NOTICE = {
  ariaLabel: 'Pliki cookies',
  heading: 'Pliki Cookies',
  text: 'Serwis wykorzystuje pliki cookies. Korzystając ze strony wyrażasz zgodę na wykorzystywanie plików cookies.',
  learnMore: 'Dowiedz się więcej.',
  accept: 'Ok, rozumiem',
} as const;

/** The 404 page (FR-039). */
const NOT_FOUND = {
  title: 'Strona nie istnieje',
  code: 'Błąd 404',
} as const;

/** The shared UI kit's own copy (pagination and table defaults), Polish like the rest (NFR-005). */
const SHARED = {
  pagination: {
    ariaLabel: 'Paginacja',
    previous: 'Poprzednia',
    next: 'Następna',
    status: (page: number, count: number): string => `Strona ${page} z ${count}`,
  },
  table: {
    empty: 'Brak danych.',
    actions: 'Akcje',
  },
} as const;

/** The server-error page (FR-039). */
const SERVER_ERROR = {
  title: 'Mamy obecnie problem z serwerem',
  fallback: 'Serwer jest niedostępny.',
  prompt: 'Zapraszamy do kontaktu telefonicznego lub napisz do nas wiadomość.',
} as const;

/**
 * The copy the UI shows for an API failure (the localisation strategy, NFR-005).
 *
 * The API answers in English, so the UI maps a status and a field to this group and never
 * renders the server's `message`. `fieldInvalid` is what a `422` shows against the field a
 * message names; `generic` is what it shows when a message names none.
 */
const ERRORS = {
  generic: 'Popraw dane i spróbuj ponownie.',
  fieldInvalid: 'Nieprawidłowa wartość.',
} as const;

/**
 * The parameterised validation messages (the client's mirror of the server's DTO rules).
 *
 * These are functions because the bound is interpolated; the value is the same on both sides of
 * the check, so the message cannot drift from the rule. Each is exercised by `copy.spec.ts`.
 */
const VALIDATION = {
  nameRange: (min: number, max: number): string => `Nazwa musi mieć od ${min} do ${max} znaków`,
  nickRange: (min: number, max: number): string =>
    `Nazwa w kalendarzu musi mieć od ${min} do ${max} znaków`,
  contactPersonRange: (min: number, max: number): string =>
    `Osoba kontaktowa musi mieć od ${min} do ${max} znaków`,
  phoneRange: (min: number, max: number): string =>
    `Telefon musi mieć od ${min} do ${max} znaków`,
  streetRange: (min: number, max: number): string =>
    `Ulica musi mieć od ${min} do ${max} znaków`,
  cityRange: (min: number, max: number): string =>
    `Miasto musi mieć od ${min} do ${max} znaków`,
  zipCodeRule: (length: number): string =>
    `Kod pocztowy musi mieć ${length} znaków (cyfry, kropki, ukośniki, myślniki)`,
  nipRequired: (min: number, max: number): string =>
    `NIP jest wymagany dla firmy (${min}–${max} znaków, cyfry, kropki, ukośniki, myślniki)`,
  nipNotIndividual: 'NIP nie dotyczy osoby prywatnej',
  emailInvalid: 'Podaj poprawny adres e-mail',
  passwordRange: (min: number, max: number): string =>
    `Hasło musi mieć od ${min} do ${max} znaków`,
  firstNameRange: (min: number, max: number): string =>
    `Imię musi mieć od ${min} do ${max} znaków`,
  lastNameRange: (min: number, max: number): string =>
    `Nazwisko musi mieć od ${min} do ${max} znaków`,
  passwordsMismatch: 'Hasła muszą być identyczne',
  cityRequired: 'Miasto jest wymagane dla każdej roli poza administratorem',
  personNameRange: (min: number, max: number): string =>
    `Imię i nazwisko musi mieć od ${min} do ${max} znaków`,
  personCompanyMax: (max: number): string => `Nazwa firmy może mieć maksymalnie ${max} znaków`,
  commentsMax: (max: number): string => `Uwagi mogą mieć maksymalnie ${max} znaków`,
  discountInvalid: 'Rabat musi być wartością procentową, np. 10%',
  personRequired: 'Wybierz pracownika',
  messageRequired: 'Wiadomość nie może być pusta',
  emailRequired: 'E-mail jest wymagany',
  emailAt: 'E-mail musi zawierać @',
  emailRange: (min: number, max: number): string =>
    `E-mail musi mieć od ${min} do ${max} znaków`,
  passwordRequired: 'Hasło jest wymagane',
} as const;

/** The value vocabularies the screens label (client type, payment method, role). */
const LABELS = {
  clientType: {INDIVIDUAL: 'Osoba prywatna', COMPANY: 'Firma'},
  payment: {TRANSFER: 'Przelew', CASH: 'Gotówka', FREE: 'Bezpłatne'},
  role: {ADMIN: 'Administrator', OFFICE: 'Biuro', EMPLOYEE: 'Pracownik'},
} as const;

/**
 * The catalogue, grouped by surface. A component reads the group it owns and exposes it to its
 * template, so the template holds no literal copy of its own.
 */
export const COPY = {
  common: COMMON,
  nav: NAV,
  footer: FOOTER,
  admin: ADMIN,
  calendar: CALENDAR,
  bookingRequest: BOOKING_REQUEST,
  bookings: BOOKINGS,
  clients: CLIENTS,
  users: USERS,
  facilities: FACILITIES,
  summary: SUMMARY,
  signIn: SIGN_IN,
  contact: CONTACT,
  cookieNotice: COOKIE_NOTICE,
  notFound: NOT_FOUND,
  shared: SHARED,
  serverError: SERVER_ERROR,
  errors: ERRORS,
  validation: VALIDATION,
  labels: LABELS,
} as const;

export type TCopy = typeof COPY;
