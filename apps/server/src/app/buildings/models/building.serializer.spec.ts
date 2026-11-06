import {PUBLIC_BUILDING_REDACTIONS} from '@models/building.model';
import {serializePublicBuilding, serializePublicBuildings} from './building.serializer';

/** A facility carrying every staff-only field the redaction list names, plus the rest. */
const fullBuilding = () => ({
  _id: 'b1',
  name: 'Hala sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/1', '1/2'],
  lighting: false,
  toilets: false,
  email: 'siechnice.hala@gmail.com',
  phone: '609996064',
  street: 'ul. Sportowa 1',
  zipCode: '55-010',
  employees: ['Bożena Kaczyńska'],
});

describe('serializePublicBuilding', () => {
  it.each(PUBLIC_BUILDING_REDACTIONS)('removes %s from a public response', (field) => {
    // Asserted per name rather than by count: the list is the policy, and a name
    // that is missing from it is a disclosure a length assertion would not catch.
    const result = serializePublicBuilding(fullBuilding());

    expect(result).not.toHaveProperty(field);
  });

  it('keeps the fields the calendar and booking form need', () => {
    const result = serializePublicBuilding(fullBuilding());

    expect(result).toMatchObject({
      _id: 'b1',
      name: 'Hala sportowa',
      property: 'hala-sportowa',
      city: 'siechnice',
      sizes: ['1/1', '1/2'],
      lighting: false,
      toilets: false,
    });
  });

  it('reads the fields through toJSON when the document has one', () => {
    const document = {
      ...fullBuilding(),
      toJSON: () => ({...fullBuilding()}),
    };

    expect(serializePublicBuilding(document)).toMatchObject({_id: 'b1'});
  });

  it('returns null for a missing facility', () => {
    expect(serializePublicBuilding(null)).toBeNull();
    expect(serializePublicBuilding(undefined)).toBeNull();
  });

  it('serialises a list', () => {
    const result = serializePublicBuildings([fullBuilding(), fullBuilding()]);

    expect(result).toHaveLength(2);
    expect(result[0]).not.toHaveProperty('email');
  });
});
