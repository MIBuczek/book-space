import {FacilityDatePipe} from './facility-date.pipe';

/**
 * The pipe is the UI's only date/time formatter (R4, T055). These cases pin the two things
 * that were wrong in the legacy app: the zone (a browser-local `Date` method formats in the
 * viewer's zone, not the facility's) and the missing-value handling (a table cell must show
 * an empty string, not `Invalid Date`).
 */
describe('FacilityDatePipe', () => {
  const pipe = new FacilityDatePipe();

  it('formats a date in the facility calendar, not the browser zone', () => {
    // 22:30Z in summer is 00:30 the next local day; the date must roll over.
    expect(pipe.transform(new Date('2026-07-10T22:30:00Z'), 'date')).toBe('2026-07-11');
  });

  it('formats a time as zero-padded HH:MM in the facility calendar', () => {
    expect(pipe.transform(new Date('2026-07-10T06:05:00Z'), 'time')).toBe('08:05');
    // Local midnight is 00:00, not 24:00.
    expect(pipe.transform(new Date('2026-07-10T22:00:00Z'), 'time')).toBe('00:00');
  });

  it('defaults to the date shape', () => {
    expect(pipe.transform(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('accepts the string and number forms Angular templates hand it', () => {
    expect(pipe.transform('2026-01-05T12:00:00Z', 'date')).toBe('2026-01-05');
    expect(pipe.transform(Date.UTC(2026, 0, 5, 12), 'date')).toBe('2026-01-05');
  });

  it('renders an empty string for a missing value rather than Invalid Date', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
