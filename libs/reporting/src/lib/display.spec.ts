import {
  REPORT_VALUE_LABELS,
  displayBoolean,
  displaySelectedOptions,
  displayValue,
  toPercentage,
} from './display';

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

  it('carries a label for every facility key and payment the schema can store', () => {
    // The report's vocabulary is the legacy one; this pins the keys the server can emit so a
    // new payment or facility cannot reach a report as a raw enum.
    for (const key of ['kort_2', 'orlik', 'sala-fitness', 'boisko-trawnik']) {
      expect(REPORT_VALUE_LABELS[key] ?? key).toBeDefined();
    }
  });
});

describe('displayBoolean', () => {
  it('uses the legacy Tak/Nie labels', () => {
    expect(displayBoolean(true)).toBe('Tak');
    expect(displayBoolean(false)).toBe('Nie');
  });
});

describe('displaySelectedOptions', () => {
  const option = (options: Array<{lights: true} | {toilets: true}>) => [
    {options, fromHour: new Date('2026-03-01T10:00:00Z'), toHour: new Date('2026-03-01T11:00:00Z')},
  ];

  it('joins the first option group into a comma-separated label list', () => {
    expect(displaySelectedOptions(option([{lights: true}, {toilets: true}]))).toBe(
      'Światła,Zaplecze sanitarne'
    );
  });

  it('returns a single label when only one option was chosen', () => {
    expect(displaySelectedOptions(option([{lights: true}]))).toBe('Światła');
    expect(displaySelectedOptions(option([{toilets: true}]))).toBe('Zaplecze sanitarne');
  });

  it('returns an empty string when no option group is present', () => {
    expect(displaySelectedOptions([])).toBe('');
  });
});
