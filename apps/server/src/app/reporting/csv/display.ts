import {formatFacilityDate, formatFacilityTime} from '@booking/date-time';
import {
  displayBoolean,
  displaySelectedOptions,
  displayValue,
  toPercentage,
} from '@booking/reporting';

/**
 * Display-value helpers for the report, delegating the vocabulary to `@booking/reporting`.
 *
 * The label map, the percentage rule, the boolean wording and the extra-options list all live in
 * the shared library now, because the printable report (FR-030) prints the same values as the CSV
 * (FR-028) and the two must not disagree. This module keeps the date/time formatting, which is
 * the server's projection of `@booking/date-time`, and re-exports the shared helpers so the CSV
 * code, the booking e-mail and their specs read one import.
 *
 * The labels are the legacy Polish vocabulary, not the UI's screen wording: the report is a
 * business artefact.
 */

/**
 * A date as `YYYY-MM-DD` in the facility's calendar. Delegates to the shared date-time module
 * so the CSV export and the UI cannot format the same instant differently (R4, T055).
 */
const formatDate = (date: Date): string => formatFacilityDate(date);

/** A time as `HH:MM` in the facility's calendar. Delegates to the shared module. */
const formatTime = (date: Date): string => formatFacilityTime(date);

export {displayValue, toPercentage, formatDate, formatTime, displayBoolean, displaySelectedOptions};
