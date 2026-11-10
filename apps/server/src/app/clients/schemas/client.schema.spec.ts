import mongoose, {Model} from 'mongoose';
import {Client, ClientSchema} from './client.schema';

// The schema's validators and timestamps are what is under test, so the real schema is
// used rather than a hand-built one. Cloning keeps the definitions while letting this
// spec turn command buffering off: without a database, validation still runs in memory,
// which is where the NIP and zip-code rules live.
const isolatedSchema = ClientSchema.clone();
isolatedSchema.set('bufferCommands', false);

let ClientModel: Model<Client>;

beforeAll(() => {
  ClientModel = mongoose.model<Client>('ClientSchemaSpec', isolatedSchema);
});

afterAll(() => {
  mongoose.deleteModel('ClientSchemaSpec');
});

const client = (overrides: Record<string, unknown> = {}) => ({
  type: 'INDIVIDUAL',
  name: 'Jan Kowalski',
  contactPerson: 'Jan Kowalski',
  phone: '609996064',
  email: 'jan@example.com',
  street: 'ul. Sportowa 1',
  city: 'siechnice',
  zipCode: '55-010',
  ...overrides,
});

const errorsFor = (overrides: Record<string, unknown>) => {
  const doc = new ClientModel(client(overrides));
  return doc.validateSync()?.errors ?? {};
};

describe('ClientSchema validation', () => {
  it('accepts a complete individual', () => {
    expect(errorsFor({})).toEqual({});
  });

  it('accepts a company that carries a NIP', () => {
    expect(errorsFor({type: 'COMPANY', nip: '8991234567'})).toEqual({});
  });

  it('rejects a company with no NIP', () => {
    // FR-025: the schema is the backstop for a write that never passes through the DTO.
    expect(errorsFor({type: 'COMPANY'})).toHaveProperty('nip');
  });

  it('rejects an individual that carries a NIP', () => {
    expect(errorsFor({type: 'INDIVIDUAL', nip: '8991234567'})).toHaveProperty('nip');
  });

  it('accepts an individual with an empty-string NIP', () => {
    expect(errorsFor({type: 'INDIVIDUAL', nip: ''})).toEqual({});
  });

  it('rejects a company NIP shorter than ten characters', () => {
    expect(errorsFor({type: 'COMPANY', nip: '123'})).toHaveProperty('nip');
  });

  it('accepts a client with no nick', () => {
    expect(errorsFor({nick: undefined})).toEqual({});
  });

  it('rejects a zip code that is not six characters', () => {
    // The DTO mirrors this; the schema is what stops a direct write.
    expect(errorsFor({zipCode: '55-01'})).toHaveProperty('zipCode');
  });

  it('rejects a zip code with a character the pattern does not allow', () => {
    expect(errorsFor({zipCode: '55-01A'})).toHaveProperty('zipCode');
  });

  it('requires a type, a name and a contact person', () => {
    expect(errorsFor({type: undefined})).toHaveProperty('type');
    expect(errorsFor({name: undefined})).toHaveProperty('name');
    expect(errorsFor({contactPerson: undefined})).toHaveProperty('contactPerson');
  });

  it('rejects a malformed contact e-mail', () => {
    expect(errorsFor({email: 'not-an-email'})).toHaveProperty('email');
  });

  it('declares the index the Clients tab search needs', () => {
    // The legacy list filtered by `name` in the browser; a server-side filter without an
    // index is a collection scan. Asserted against the schema's declared indexes, which is
    // the claim this file can make without a running server.
    const indexes = ClientSchema.indexes();
    expect(indexes).toEqual(expect.arrayContaining([[{name: 1}, expect.anything()]]));
  });

  it('stamps createdAt and updatedAt when timestamps are enabled', async () => {
    // `@Schema({timestamps: true})` is what the audit fields depend on. Mongoose applies
    // them on save; without a database the document still carries the path definitions.
    expect(ClientSchema.path('createdAt')).toBeDefined();
    expect(ClientSchema.path('updatedAt')).toBeDefined();
  });

  it('defaults a new client to active (T059)', () => {
    const doc = new ClientModel(client({}));

    expect(doc.active).toBe(true);
  });

  it('stores a deactivated client as active: false', () => {
    const doc = new ClientModel(client({active: false}));

    expect(doc.active).toBe(false);
  });
});
