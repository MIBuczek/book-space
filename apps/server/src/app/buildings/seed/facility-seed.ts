import {IBuilding} from '@models/building.model';

/** A facility as the seed declares it: the stored shape without the database-assigned id. */
export type TSeedFacility = Omit<IBuilding, '_id'>;

/**
 * The twelve facilities and four cities from `spec.md` §4, transcribed from the legacy
 * `building-data-const.ts` (research.md R6). This is the single source of truth the seed
 * writes into MongoDB; the legacy UI read a compiled-in constant *and* a Firebase
 * collection, preferring the database and falling back to the constant, so the two could
 * disagree. Here the constant is only ever the seed's input, never a runtime fallback.
 *
 * `spec.md` §4 lists twelve facilities but §1's introduction says "13 rentable sport
 * facilities"; the legacy constant and the per-city tables both agree on twelve, so twelve
 * is what is seeded. The discrepancy is recorded in research.md R6.
 *
 * Phone, e-mail and employees are not in §4's table — they come from the legacy constant,
 * which is the only place they exist. No facility carries a `street`/`zipCode`: the legacy
 * data has no address, which is why the schema treats both as optional (T012). Phone numbers
 * keep the legacy grouping (`609 996 064`) rather than being normalised, so the seeded value
 * matches what staff already recognise; the trailing space in the legacy Święta Katarzyna
 * name (`'Hala sportowa '`) is dropped, since it is a typo rather than data.
 *
 * Ordering is by city, then by the legacy constant's own order, so the seed is deterministic
 * and a diff of the collection against this file reads the same way.
 */
export const FACILITY_SEED: readonly TSeedFacility[] = [
  {
    name: 'Hala sportowa',
    property: 'hala-sportowa',
    city: 'siechnice',
    sizes: ['1/3', '2/3', '1/1'],
    lighting: false,
    toilets: false,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'Sala fitness',
    property: 'sala-fitness',
    city: 'siechnice',
    sizes: ['1/1'],
    lighting: false,
    toilets: false,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'Boisko ze sztuczną nawierzchnią',
    property: 'boisko-sztuczna-nawierzchnia',
    city: 'siechnice',
    sizes: ['1/1', '1/2', '1/4', '3/4'],
    lighting: true,
    toilets: true,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'Boisko trawiaste na stadionie LA',
    property: 'boisko-trawiaste-stadionie-la',
    city: 'siechnice',
    sizes: ['1/1', '1/2', '1/4', '3/4'],
    lighting: false,
    toilets: false,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'Orlik',
    property: 'orlik',
    city: 'siechnice',
    sizes: ['1/1', '1/2'],
    lighting: false,
    toilets: false,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'KORT#1',
    property: 'kort_1',
    city: 'siechnice',
    sizes: ['1/1'],
    lighting: false,
    toilets: false,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'KORT#2',
    property: 'kort_2',
    city: 'siechnice',
    sizes: ['1/1'],
    lighting: false,
    toilets: false,
    email: 'siechnice.hala@gmail.com',
    phone: '609 996 064',
    employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  },
  {
    name: 'Hala sportowa',
    property: 'hala-sportowa',
    city: 'radwanice',
    sizes: ['1/1', '1/2'],
    lighting: false,
    toilets: false,
    email: 'radwanice.hala@gmail.com',
    phone: '609 996 065',
    employees: ['Dorota Gąszczak'],
  },
  {
    name: 'Sala fitness',
    property: 'sala-fitness',
    city: 'radwanice',
    sizes: ['1/1'],
    lighting: false,
    toilets: false,
    email: 'radwanice.hala@gmail.com',
    phone: '609 996 065',
    employees: ['Dorota Gąszczak'],
  },
  {
    name: 'Hala sportowa',
    property: 'hala-sportowa',
    city: 'swieta-katarzyna',
    sizes: ['1/1', '1/2'],
    lighting: false,
    toilets: false,
    email: 'swkatarzyna.hala@gmail.com',
    phone: '609 996 067',
    employees: ['Urszula Ślipko'],
  },
  {
    name: 'Hala sportowa',
    property: 'hala-sportowa',
    city: 'zerniki-wroclawskie',
    sizes: ['1/1', '1/2'],
    lighting: false,
    toilets: false,
    email: 'zerniki.hala@gmail.com',
    phone: '609 996 068',
    employees: ['Danuta Wilk'],
  },
  {
    name: 'Sala fitness',
    property: 'sala-fitness',
    city: 'zerniki-wroclawskie',
    sizes: ['1/1'],
    lighting: false,
    toilets: false,
    email: 'zerniki.hala@gmail.com',
    phone: '609 996 068',
    employees: ['Danuta Wilk'],
  },
];

/**
 * The four cities the sample facilities sit in, in the order `spec.md` §4 lists them.
 *
 * This is the *sample data's* city list, not a constraint: cities are data (spec.md §9 open
 * question 1), so this constant describes what the seed contains, not what a deployment may
 * use. Nothing validates a new facility's city against it.
 */
export const CITY_SEED: readonly string[] = [
  'siechnice',
  'radwanice',
  'swieta-katarzyna',
  'zerniki-wroclawskie',
];
