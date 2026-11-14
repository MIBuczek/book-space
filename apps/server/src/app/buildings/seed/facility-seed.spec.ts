import {SIZES} from '@models/building.model';
import {FACILITY_SEED, CITY_SEED} from './facility-seed';

/**
 * Guards the transcription of `spec.md` §4 (research.md R6). The seed is reference data:
 * a typo in a size or a duplicated `{city, property}` pair is not caught by the schema
 * (which validates one document at a time) and would only surface as a wrong calendar.
 */
describe('facility seed data', () => {
  it('carries twelve facilities', () => {
    expect(FACILITY_SEED).toHaveLength(12);
  });

  it('covers exactly the four cities', () => {
    const cities = [...new Set(FACILITY_SEED.map((f) => f.city))].sort();
    expect(cities).toEqual([...CITY_SEED].sort());
    expect(CITY_SEED).toHaveLength(4);
  });

  it('uses only size values the shared model allows', () => {
    for (const facility of FACILITY_SEED) {
      expect(CITY_SEED).toContain(facility.city);
      expect(facility.sizes.length).toBeGreaterThan(0);
      for (const size of facility.sizes) {
        expect(SIZES).toContain(size);
      }
    }
  });

  it('has a unique {city, property} pair per facility', () => {
    const keys = FACILITY_SEED.map((f) => `${f.city}/${f.property}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('repeats the property key across cities, which is why the index is compound', () => {
    const halaSportowaCities = FACILITY_SEED.filter((f) => f.property === 'hala-sportowa').map(
      (f) => f.city,
    );
    expect(halaSportowaCities.sort()).toEqual([...CITY_SEED].sort());
  });

  it('flags lighting and toilets for the synthetic pitch only', () => {
    const withOptions = FACILITY_SEED.filter((f) => f.lighting || f.toilets);
    expect(withOptions).toHaveLength(1);
    expect(withOptions[0].property).toBe('boisko-sztuczna-nawierzchnia');
    expect(withOptions[0].lighting).toBe(true);
    expect(withOptions[0].toilets).toBe(true);
  });

  it('carries a contact e-mail and phone for every facility', () => {
    for (const facility of FACILITY_SEED) {
      expect(facility.email).toMatch(/^[^@\s]+@[^@\s]+$/);
      // The legacy constant groups the digits as `609 996 064`; that spacing is
      // preserved rather than normalised, so the check allows it.
      expect(facility.phone).toMatch(/^\d{3} ?\d{3} ?\d{3}$/);
    }
  });
});
