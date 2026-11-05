import {Pipe, PipeTransform} from '@angular/core';
import {formatFacilityDate, formatFacilityTime} from '@booking/date-time';

/**
 * Formats an instant in the facility's calendar (`Europe/Warsaw`) for the UI.
 *
 * This is the UI's entry point to the shared date-time module (R4, T055): every Angular
 * surface renders a date or a time through this pipe rather than calling `Date.prototype`
 * methods, which would format in the *browser's* zone and disagree with the API — the
 * defect the legacy `toLocaleDateString()` had. The formatting itself lives in the library,
 * so the CSV export and the screen cannot drift.
 *
 * `kind` selects the shape: `'date'` → `YYYY-MM-DD`, `'time'` → `HH:MM`.
 */
@Pipe({name: 'facilityDate'})
export class FacilityDatePipe implements PipeTransform {
  transform(value: Date | string | number | null | undefined, kind: 'date' | 'time' = 'date'): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const instant = new Date(value);
    return kind === 'time' ? formatFacilityTime(instant) : formatFacilityDate(instant);
  }
}
