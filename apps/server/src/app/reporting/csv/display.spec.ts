import {displayBoolean, displaySelectedOptions, displayValue, formatDate, formatTime, toPercentage} from './display';

describe('toPercentage', () => {
  it('truncates the rented fraction to a whole percentage, like the legacy helper', () => {
    expect(toPercentage('1/3')).toBe('33%');
    expect(toPercentage('2/3')).toBe('66%');
    expect(toPercentage('1/2')).toBe('50%');
    expect(toPercentage('1/1')).toBe('100%');
    expect(toPercentage('1/4')).toBe('25%');
    expect(toPercentage('3/4')).toBe('75%');
  });

  it('returns an empty string for a malformed fraction rather than NaN%', () => {
    expect(toPercentage('not-a-size')).toBe('');
    expect(toPercentage('1/0')).toBe('');
  });
});

describe('displayValue', () => {
  it('maps stored enums to the legacy Polish labels', () => {
    expect(displayValue('INITIAL')).toBe('Nie rozpoczęta');
    expect(displayValue('DONE')).toBe('Zakończona');
    expect(displayValue('CANCELED')).toBe('Rezygnacja');
    expect(displayValue('CASH')).toBe('Gotówka');
    expect(displayValue('TRANSFER')).toBe('Przelew');
    expect(displayValue('FREE')).toBe('Bezpłatne');
    expect(displayValue('siechnice')).toBe('Siechnice');
    expect(displayValue('swieta-katarzyna')).toBe('Święta Katarzyna');
    expect(displayValue('zerniki-wroclawskie')).toBe('Żerniki Wrocławskie');
    expect(displayValue('hala-sportowa')).toBe('Hala sportowa');
    expect(displayValue('kort_1')).toBe('KORT#1');
  });

  it('falls through to the raw value for an unmapped value, and to empty for a missing one', () => {
    expect(displayValue('unknown-value')).toBe('unknown-value');
    expect(displayValue(undefined)).toBe('');
    expect(displayValue(null)).toBe('');
  });
});

describe('formatDate / formatTime', () => {
  it('formats a date in the facility calendar, not UTC', () => {
    // 22:30Z in summer is 00:30 the next day locally, so the report day must be the 11th.
    expect(formatDate(new Date('2026-07-10T22:30:00Z'))).toBe('2026-07-11');
  });

  it('formats a time as zero-padded HH:MM', () => {
    expect(formatTime(new Date('2026-07-10T06:05:00Z'))).toBe('08:05');
    expect(formatTime(new Date('2026-07-10T22:00:00Z'))).toBe('00:00');
  });
});

describe('displayBoolean', () => {
  it('uses the legacy Tak/Nie labels', () => {
    expect(displayBoolean(true)).toBe('Tak');
    expect(displayBoolean(false)).toBe('Nie');
  });
});

describe('displaySelectedOptions', () => {
  it('joins the first option group into a comma-separated label list', () => {
    expect(
      displaySelectedOptions([
        {
          options: [{lights: true}, {toilets: true}],
          fromHour: new Date('2026-03-01T10:00:00Z'),
          toHour: new Date('2026-03-01T11:00:00Z'),
        },
      ])
    ).toBe('Światła,Zaplecze sanitarne');
  });

  it('returns a single label when only one option was chosen', () => {
    expect(
      displaySelectedOptions([
        {
          options: [{lights: true}],
          fromHour: new Date('2026-03-01T10:00:00Z'),
          toHour: new Date('2026-03-01T11:00:00Z'),
        },
      ])
    ).toBe('Światła');
  });

  it('returns an empty string when no option group is present', () => {
    expect(displaySelectedOptions([])).toBe('');
  });
});
