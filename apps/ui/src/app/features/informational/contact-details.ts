/**
 * The contact details the informational pages and the footer render.
 *
 * Transcribed from the legacy `Contact.tsx`, `ServerError.tsx` and `Footer.tsx` so the
 * rewrite shows the same addresses and numbers. Kept as data rather than inline template
 * text because the contact page and the server-error page share the office phone and
 * e-mail, and a number that differs between the two is exactly the drift a single source
 * prevents.
 */

/** The SISK registered office, as shown in the legacy contact page's first column. */
export const REGISTERED_OFFICE = {
  name: 'Siechnicka Inwestycyjna Spółka Komunalna sp. z o.o.',
  address: 'ul. Jana Pawła II 12, 55-011 Siechnice'
} as const;

/** The correspondence address, phone, e-mail and website of the office. */
export const OFFICE_CONTACT = {
  address: 'ul. Księżnej Anny z Przemyślidów 6a, 55-011 Siechnice',
  // The legacy page showed "609 996 070" as the text of a `tel:+48718890023` link, so the
  // displayed number and the dialled number disagreed. The href is the trustworthy half: it
  // is corroborated by `ServerError.tsx`, which labels the same href "71 889 00 23".
  phone: '71 889 00 23',
  phoneHref: 'tel:+48718890023',
  email: 'biuro@sisk-siechnice.pl',
  website: 'www.sisk-siechnice.pl',
  websiteHref: 'https://www.sisk-siechnice.pl/'
} as const;

/** The person a tenant contacts about a booking (FR-039). */
export const BOOKING_CONTACT = {
  name: 'Michał Hoffman',
  role: 'Kierownik obsługi obiektów sportowych i rekreacyjnych',
  phone: '691 113 592',
  phoneHref: 'tel:+48691113592',
  email: 'michal.hoffman@sisk-siechnice.pl'
} as const;

/** The office opening hours, in the order the legacy page listed them. */
export const OFFICE_HOURS: readonly {day: string; hours: string}[] = [
  {day: 'poniedziałek', hours: '08:00 - 14:00'},
  {day: 'wtorek', hours: '08:00 - 14:00'},
  {day: 'środa', hours: '08:00 - 14:00'},
  {day: 'czwartek', hours: '08:00 - 16:00'},
  {day: 'piątek', hours: '08:00 - 14:00'}
];

/** The privacy policy (FR-039). */
export const PRIVACY_POLICY_URL = 'https://www.sisk-siechnice.pl/polityka-prywatnosci';

/** The SISK website the footer links to. */
export const SISK_WEBSITE_URL = 'https://www.sisk-siechnice.pl/';
