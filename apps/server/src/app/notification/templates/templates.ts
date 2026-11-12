/**
 * The notification e-mail templates, transcribed as versioned assets.
 *
 * The legacy app sent these through EmailJS, where the markup lived in the EmailJS account and
 * was never in the repository — only the *variable set* was (`email-services.ts`). These assets
 * pin that variable set and the subject lines as reviewable code, so a rename is a diff rather
 * than a silent change in what staff and facilities receive. The full contract — recipient,
 * subject, variables and how each variable is derived — is
 * `specs/001-booking-platform-rewrite/contracts/notification-templates.md`.
 *
 * Placeholder syntax:
 *
 * - `{{name}}` — a required variable. The renderer throws if it is absent, so a template and
 *   its variable set cannot drift apart silently.
 * - `{{#name}}…{{/name}}` — an optional block, dropped when the value is empty. `club`,
 *   `message` and `phone` are optional on a booking, so the line is omitted rather than left
 *   with a dangling label.
 */

/**
 * One template: the identifiers it was ported from, who receives it, and the body.
 *
 * `legacyTemplateId` is kept so a future migration back to a provider template can be matched
 * by id, and so the origin of the wording is traceable without leaving the file.
 */
interface INotificationTemplate {
  /** The stable name the code selects on. */
  id: TTemplateId;
  /**
   * The EmailJS template this was ported from (`email-service-data.ts`). Absent for the two
   * applicant templates, which the legacy app never sent — they are new (T062), so there is no
   * id to trace the wording back to.
   */
  legacyTemplateId?: string;
  /** The audience the recipient resolves from. */
  recipient: 'FACILITY' | 'STAFF' | 'APPLICANT' | 'CONTACT' | 'EMPLOYEE';
  /** The subject line, with the same placeholder syntax as the body. */
  subject: string;
  /** The body. */
  body: string;
}

const TEMPLATE_IDS = [
  'booking-facility',
  'booking-staff',
  'booking-approved',
  'booking-rejected',
  'contact-message',
  'employee-message',
] as const;
type TTemplateId = (typeof TEMPLATE_IDS)[number];

/**
 * The name that signs the applicant e-mails when `TENANT_NAME` is not configured.
 *
 * The signature is a required `{{tenantName}}` placeholder rather than a literal, so the brand
 * is a deployment setting (FR-033) and not baked into a template. This constant is the fallback
 * the service supplies when the variable is unset, so a template and its variable set cannot
 * drift apart and an unconfigured deployment still signs its mail.
 */
const DEFAULT_TENANT_NAME = 'Book Space';

/**
 * The two booking variants are kept distinct rather than merged into one formatter.
 *
 * The legacy code had two near-identical builders and the difference is a real contract:
 * the facility variant carries `buildingEmail` and joins slots with a newline, the staff
 * variant has no `buildingEmail` and joins them with `" / "`. Collapsing them would change
 * what one audience receives, which is exactly what this task exists to prevent.
 */
const NOTIFICATION_TEMPLATES: Record<TTemplateId, INotificationTemplate> = {
  'booking-facility': {
    id: 'booking-facility',
    legacyTemplateId: 'template_5l7nfa5',
    recipient: 'FACILITY',
    subject: 'Nowa rezerwacja: {{building}} ({{city}})',
    body: [
      'Nowa rezerwacja\n',
      '\n',
      'Obiekt: {{building}}\n',
      'Miejscowość: {{city}}\n',
      'Płatność: {{payment}}\n',
      'Osoba: {{person}}\n',
      '{{#club}}Firma: {{club}}\n{{/club}}',
      'Email: {{email}}\n',
      'Telefon: {{phone}}\n',
      '\n',
      '{{parsedBookingTime}}\n',
      '{{#message}}\nWiadomość: {{message}}\n{{/message}}',
      '\n',
      'E-mail obiektu: {{buildingEmail}}\n',
    ].join(''),
  },
  'booking-staff': {
    id: 'booking-staff',
    legacyTemplateId: 'template_gsvb2al',
    recipient: 'STAFF',
    subject: 'Nowa prośba o rezerwację: {{building}} ({{city}})',
    body: [
      'Nowa prośba o rezerwację\n',
      '\n',
      'Obiekt: {{building}}\n',
      'Miejscowość: {{city}}\n',
      'Płatność: {{payment}}\n',
      'Osoba: {{person}}\n',
      '{{#club}}Firma: {{club}}\n{{/club}}',
      'Email: {{email}}\n',
      'Telefon: {{phone}}\n',
      '\n',
      '{{parsedBookingTime}}\n',
      '{{#message}}\nWiadomość: {{message}}\n{{/message}}',
    ].join(''),
  },
  'booking-approved': {
    id: 'booking-approved',
    recipient: 'APPLICANT',
    subject: 'Rezerwacja zatwierdzona: {{building}} ({{city}})',
    body: [
      'Witam,\n',
      '\n',
      'Twoja prośba o rezerwację została zatwierdzona.\n',
      '\n',
      'Obiekt: {{building}}\n',
      'Miejscowość: {{city}}\n',
      'Płatność: {{payment}}\n',
      'Osoba: {{person}}\n',
      '{{#club}}Firma: {{club}}\n{{/club}}',
      '\n',
      '{{parsedBookingTime}}\n',
      '{{#message}}\nWiadomość: {{message}}\n{{/message}}',
      '\n',
      'Pozdrawiamy,\n',
      '{{tenantName}}\n',
    ].join(''),
  },
  'booking-rejected': {
    id: 'booking-rejected',
    recipient: 'APPLICANT',
    subject: 'Rezerwacja odrzucona: {{building}} ({{city}})',
    body: [
      'Witam,\n',
      '\n',
      'Twoja prośba o rezerwację została odrzucona.\n',
      '\n',
      'Obiekt: {{building}}\n',
      'Miejscowość: {{city}}\n',
      'Płatność: {{payment}}\n',
      'Osoba: {{person}}\n',
      '{{#club}}Firma: {{club}}\n{{/club}}',
      '\n',
      '{{parsedBookingTime}}\n',
      '{{#message}}\nWiadomość: {{message}}\n{{/message}}',
      '\n',
      'Pozdrawiamy,\n',
      '{{tenantName}}\n',
    ].join(''),
  },
  'contact-message': {
    id: 'contact-message',
    legacyTemplateId: 'template_730331f',
    recipient: 'CONTACT',
    subject: 'Wiadomość od {{person}}',
    body: [
      'Osoba: {{person}}\n',
      'Email: {{email}}\n',
      '{{#phone}}Telefon: {{phone}}\n{{/phone}}',
      '\n',
      '{{message}}\n',
    ].join(''),
  },
  'employee-message': {
    id: 'employee-message',
    legacyTemplateId: 'template_izso2cm',
    recipient: 'EMPLOYEE',
    subject: 'Wiadomość od {{person}}',
    body: ['Osoba: {{person}}\n', 'Email: {{email}}\n', '\n', '{{message}}\n'].join(''),
  },
};

export {NOTIFICATION_TEMPLATES, TEMPLATE_IDS, DEFAULT_TENANT_NAME};
export type {INotificationTemplate, TTemplateId};
