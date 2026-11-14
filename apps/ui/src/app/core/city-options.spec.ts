import {IBuilding, IPublicBuilding} from '@models/building.model';
import {cityOptions, keepSelected} from './city-options';

/**
 * The shared city-selector helpers (FR-007, spec.md §9 open question 1).
 *
 * Cities are data, so the options are the distinct cities the facilities carry, labelled
 * through `cityLabel`; `keepSelected` is the rule every selector's `linkedSignal` uses to keep
 * a valid choice across a refresh.
 */
describe('cityOptions', () => {
  it('derives the distinct cities from the facilities, in facility order, with labels', () => {
    const facilities = [
      {city: 'siechnice'},
      {city: 'radwanice'},
      {city: 'siechnice'},
    ] as IBuilding[];
    expect(cityOptions(facilities)).toEqual([
      {value: 'siechnice', label: 'Siechnice'},
      {value: 'radwanice', label: 'Radwanice'},
    ]);
  });

  it('labels a city the map does not name with the value as typed', () => {
    const facilities = [{city: 'nowe-miasto'}] as IPublicBuilding[];
    expect(cityOptions(facilities)).toEqual([{value: 'nowe-miasto', label: 'nowe-miasto'}]);
  });

  it('returns no options for an empty facility list', () => {
    expect(cityOptions([])).toEqual([]);
  });
});

describe('keepSelected', () => {
  const options = [
    {value: 'a', label: 'A'},
    {value: 'b', label: 'B'},
  ];

  it('keeps the previous value while it is still an option', () => {
    expect(keepSelected(options, 'b')).toBe('b');
  });

  it('falls back to the first option when the previous value is gone', () => {
    expect(keepSelected(options, 'c')).toBe('a');
  });

  it('falls back to the first option when there was no previous value', () => {
    expect(keepSelected(options, undefined)).toBe('a');
  });

  it('returns an empty string for an empty option list', () => {
    expect(keepSelected([], 'a')).toBe('');
  });
});
