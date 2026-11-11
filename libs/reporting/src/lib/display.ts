import {ISelectedExtraOption} from '@models/selected-extra-option.model';

/**
 * Display-value helpers for the reporting artefacts (FR-028, FR-030).
 *
 * They live in this shared library rather than in the server because two artefacts print the
 * same values — the CSV export (`apps/server/src/app/reporting/csv/`) and the printable report
 * (the admin Summary tab) — and the business opens both. A copy per artefact is exactly the
 * drift the constitution's single-source principle forbids, and it would only surface as a
 * report whose vocabulary disagreed with the export it is supposed to match (T028 acceptance
 * criterion 2).
 *
 * The labels are the legacy Polish vocabulary from `transformValue` / `modelDisplayValue`
 * (`modeling-value-function.ts`), not the UI's screen wording: the report is a business
 * artefact, not a screen.
 */

/**
 * The Polish display labels for the values a report prints.
 *
 * The status labels are the *legacy* `transformValue` wording, which the target adopts for the
 * UI as well (CHK014, issue #55): the legacy dropdown labelled `QUIT` "Odwołana" while the app's
 * own table, summary and CSV called it "Rezygnacja", so the rewrite keeps the report's wording
 * and makes the screen agree with it rather than the reverse. A guard in the UI
 * (`bookings-table.spec.ts`) asserts each screen label equals `displayValue(status)`, so the two
 * maps cannot drift apart again. The legacy `CARD` payment is absent because the target enum
 * drops it (CHK015).
 */
const REPORT_VALUE_LABELS: Record<string, string> = {
  // Slot statuses (legacy `BOOKING_STATUS`, target `BOOKING_STATUSES`).
  INITIAL: 'Nie rozpoczęta',
  DONE: 'Zakończona',
  CANCELED: 'Rezygnacja',
  // Facility cities.
  siechnice: 'Siechnice',
  radwanice: 'Radwanice',
  'swieta-katarzyna': 'Święta Katarzyna',
  'zerniki-wroclawskie': 'Żerniki Wrocławskie',
  // Facility keys.
  'boisko-sztuczna-nawierzchnia': 'Boisko ze sztuczną nawierzchnią',
  'boisko-trawiaste-stadionie-la': 'Boisko trawiaste na stadionie LA',
  'bieznia-na-stadionie-la': 'Bieżnia na stadionie LA',
  'sala-fitness': 'Sala fitness',
  'hala-sportowa': 'Hala sportowa',
  kort_1: 'KORT#1',
  kort_2: 'KORT#2',
  orlik: 'Orlik',
  // Payment methods.
  CASH: 'Gotówka',
  TRANSFER: 'Przelew',
  FREE: 'Bezpłatne',
};

/**
 * The label for a stored value, or the value itself when it has no mapping.
 *
 * The legacy `modelDisplayValue` fell through to the raw string for unmapped values (and
 * title-cased the city/building fields); falling through to the raw value is what keeps an
 * unmapped-but-valid value visible rather than blank. It does not title-case: the map above
 * carries every value the schema can produce, so a fall-through means data the schema does not
 * describe, and showing it verbatim is more honest than guessing its casing.
 */
const displayValue = (value: string | undefined | null): string => {
  if (value === undefined || value === null) {
    return '';
  }
  return REPORT_VALUE_LABELS[value] ?? String(value);
};

/**
 * The rented area as a percentage of a hall, truncated to a whole number and suffixed with `%`
 * (legacy `transformToPercentage`). `1/3` → `33%`, not `33.33%` and not `33.33` rounded to
 * `33`; the legacy truncated the decimal part, and the value is informational on an invoice
 * line.
 */
const toPercentage = (size: string): string => {
  const [numerator, denominator] = size.split('/');
  const ratio = (Number(numerator) / Number(denominator)) * 100;
  if (!Number.isFinite(ratio)) {
    return '';
  }
  return `${Math.trunc(ratio)}%`;
};

/** A boolean as the legacy `Tak`/`Nie` label (legacy `modelDisplayValue` on a boolean). */
const displayBoolean = (value: boolean): string => (value ? 'Tak' : 'Nie');

/**
 * The selected extra options as a comma-joined label list (legacy `checkSelectedOption`):
 * `Światła` and/or `Zaplecze sanitarne`. Only the first option group is used, matching the
 * legacy `selectedOptions[0]`.
 *
 * Each option is a single-key object, so the presence of the key is the selection: a
 * `{lights: true}` contributes `Światła` and a `{toilets: true}` contributes `Zaplecze
 * sanitarne`. Reading the key's presence rather than its value also means every branch is
 * reachable, which the legacy `'lights' in option && option.lights` was not once the value is
 * typed `true`.
 */
const displaySelectedOptions = (selectedOptions: ISelectedExtraOption[]): string => {
  const first = selectedOptions[0];
  if (!first) {
    return '';
  }
  const labels: string[] = [];
  for (const option of first.options) {
    if ('lights' in option) {
      labels.push('Światła');
    }
    if ('toilets' in option) {
      labels.push('Zaplecze sanitarne');
    }
  }
  return labels.join(',');
};

export {REPORT_VALUE_LABELS, displayValue, toPercentage, displayBoolean, displaySelectedOptions};
