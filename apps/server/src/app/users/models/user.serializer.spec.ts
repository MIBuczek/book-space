import {serializeUser, serializeUsers} from './user.serializer';

/**
 * A hydrated document is represented here as the plain object `toJSON` would
 * produce, because the serialiser's contract is "given whatever Mongoose hands
 * back, return a value with no password". `toJSON` is stubbed so the spec does not
 * depend on a database.
 */
const document = (fields: Record<string, unknown>) => ({
  toJSON: () => fields,
});

describe('serializeUser', () => {
  const full = {
    _id: '507f1f77bcf86cd799439011',
    email: 'ada@example.com',
    password: '$2b$10$abcdefghijklmnopqrstuv',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'ADMIN',
    city: 'siechnice',
    buildings: ['siechnice-a'],
    active: true,
    createdAt: new Date('2020-01-01'),
    lastLogin: new Date('2020-01-02'),
  };

  it('never returns the password', () => {
    const result = serializeUser(document(full));

    expect(result).not.toHaveProperty('password');
  });

  it('never returns the password even when it is the only extra field', () => {
    const result = serializeUser(document({_id: 'user-1', password: 'hash'}));

    expect(Object.keys(result)).toEqual(['_id']);
  });

  it('returns every field the contract declares', () => {
    const result = serializeUser(document(full));

    expect(result).toEqual({
      _id: full._id,
      email: full.email,
      firstName: full.firstName,
      lastName: full.lastName,
      role: full.role,
      city: full.city,
      buildings: full.buildings,
      active: full.active,
      createdAt: full.createdAt,
      lastLogin: full.lastLogin,
    });
  });

  it('accepts a plain object as well as a document', () => {
    const result = serializeUser(full as unknown as object);

    expect(result).not.toHaveProperty('password');
    expect(result.email).toBe(full.email);
  });

  it('omits an absent optional field rather than emitting undefined', () => {
    const result = serializeUser(document({_id: 'user-1', email: 'ada@example.com', role: 'ADMIN', active: true}));

    expect(result).not.toHaveProperty('city');
    expect(result).not.toHaveProperty('buildings');
  });

  it('returns null for a null input, so a missing user stays missing', () => {
    expect(serializeUser(null)).toBeNull();
  });
});

describe('serializeUsers', () => {
  it('serialises every element of a list', () => {
    const users = [
      document({_id: 'user-1', email: 'a@example.com', password: 'hash-1'}),
      document({_id: 'user-2', email: 'b@example.com', password: 'hash-2'}),
    ];

    const result = serializeUsers(users);

    expect(result).toHaveLength(2);
    for (const user of result) {
      expect(user).not.toHaveProperty('password');
    }
  });

  it('returns an empty list unchanged', () => {
    expect(serializeUsers([])).toEqual([]);
  });
});
