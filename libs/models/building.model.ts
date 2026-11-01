/** The four facilities' cities. Stored lower-case. */
const CITIES = ['siechnice', 'radwanice', 'swieta-katarzyna', 'zerniki-wroclawskie'] as const;
type TCity = (typeof CITIES)[number];

/** Sizes are `1/1` … `3/4`, as fractions of a hall. */
const SIZES = ['1/1', '1/2', '1/3', '2/3', '1/4', '3/4'] as const;
type TSize = (typeof SIZES)[number];

interface IBuilding {
  _id: string;
  name: string;
  /** Facility key, unique per city. */
  property: string;
  city: TCity;
  sizes: TSize[];
  lighting: boolean;
  toilets: boolean;
  email: string;
  phone: string;
  street: string;
  zipCode: string;
  /** User references; the response resolves them to display names. */
  employees: string[];
}

export {CITIES, TCity, SIZES, TSize, IBuilding};
