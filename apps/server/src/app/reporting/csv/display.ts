import {ISelectedExtraOption} from '@models/selected-extra-option.model';
import {formatFacilityDate, formatFacilityTime} from '@booking/date-time';

/**
 * Display-value mapping for the report, transcribed from the legacy `transformValue` map and
 * `modelDisplayValue` (`modeling-value-function.ts`).
 *
 * The report is a Polish business artefact, so the values are the legacy Polish labels rather
 * than the stored enums. Two deliberate differences from the legacy map:
 *
 * - The legacy `QUIT` status becomes `Rezygnacja`; the target vocabulary renames it `CANCELED`
 *   (CHK014) and keeps the same label.
 * - The legacy `CARD` payment is absent because the target enum drops it (CHK015).
 */
const VALUE_LABELS: Record<string, string> = {
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
 * unmapped-but-valid value visible rather than blank. It does not title-case: the maps above
 * carry every value the schema can produce, so a fall-through means data the schema does not
 * describe, and showing it verbatim is more honest than guessing its casing.
 */
const displayValue = (value: string | undefined | null): string => {
  if (value === undefined || value === null) {
    return '';
  }
  return VALUE_LABELS[value] ?? String(value);
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

/**
 * A date as `YYYY-MM-DD` in the facility's calendar. Delegates to the shared date-time module
 * so the CSV export and the UI cannot format the same instant differently (R4, T055).
 */
const formatDate = (date: Date): string => formatFacilityDate(date);

/** A time as `HH:MM` in the facility's calendar. Delegates to the shared module. */
const formatTime = (date: Date): string => formatFacilityTime(date);

/** A boolean as the legacy `Tak`/`Nie` label (legacy `modelDisplayValue` on a boolean). */
const displayBoolean = (value: boolean): string => (value ? 'Tak' : 'Nie');

/**
 * The selected extra options as a comma-joined label list (legacy `checkSelectedOption`):
 * `Światła` and/or `Zaplecze sanitarne`. Only the first option group is used, matching the
 * legacy `selectedOptions[0]`.
 */
const displaySelectedOptions = (selectedOptions: ISelectedExtraOption[]): string => {
  const first = selectedOptions[0];
  if (!first) {
    return '';
  }
  return first.options
    .reduce<string[]>((labels, option) => {
      if ('lights' in option && option.lights) {
        labels.push('Światła');
      }
      if ('toilets' in option && option.toilets) {
        labels.push('Zaplecze sanitarne');
      }
      return labels;
    }, [])
    .join(',');
};

export {displayValue, toPercentage, formatDate, formatTime, displayBoolean, displaySelectedOptions};
