import * as os from 'os';
import mongoose from 'mongoose';
import {parseArgs, run, ensureOne, readIndexes, isAlreadyExists, isNamespaceNotFound} from './cli';
import {bindModels, openConnection} from './models';
import type {IDbModel, IBoundModel} from './models';
import {toIndexKeys, formatReport} from './report';
import {createEnsureTestContext} from '../testing/mongo-test-context';
import type {IEnsureTestContext} from '../testing/mongo-test-context';

/**
 * A model stub whose methods can be made to fail, for the error paths a real server will not
 * produce on demand (a permissions error, a missing namespace). `schema` is a real
 * `mongoose.Schema` because the bound-model type names one; the stub only ever calls the three
 * methods it overrides.
 */
const stubModel = (overrides: Partial<IDbModel>): IBoundModel => ({
  collection: 'users',
  model: {
    schema: new mongoose.Schema({}),
    createCollection: () => Promise.resolve(),
    createIndexes: () => Promise.resolve(),
    listIndexes: () => Promise.resolve([]),
    ...overrides,
  },
});

/**
 * `ensure-collections` against a real `mongod` (003 T117).
 *
 * The tool's contract is "the collections and indexes the server's schemas declare exist, and
 * running it twice changes nothing", so the test runs the real command against a real server and
 * reads the indexes back with `listIndexes()`. A stub model would prove nothing about the index
 * keys the server actually builds, which is the whole point of the tool.
 */

const connect = (uri: string) => openConnection(uri, {runtimeAdapters: {os}});

/**
 * The driver `Db` behind a connection, narrowed rather than asserted.
 *
 * `Connection.db` is `Db | undefined` (it is undefined before the connection opens), so the
 * specs would otherwise carry a non-null assertion on every access. A guard that throws keeps
 * the lint clean and fails a spec loudly if the connection was not awaited, rather than with a
 * `cannot read property of undefined` from inside the driver.
 */
const requireDb = (connection: mongoose.Connection): mongoose.mongo.Db => {
  const db = connection.db;
  if (db === undefined) {
    throw new Error('connection is not open');
  }
  return db;
};

/** The index keys present on a collection, as comparable strings. */
const indexKeys = async (uri: string, collection: string): Promise<string[]> => {
  const connection = await connect(uri);
  try {
    const rows = await requireDb(connection).collection(collection).listIndexes().toArray();
    return rows.map((row) => JSON.stringify((row as {key: Record<string, unknown>}).key));
  } finally {
    await connection.close();
  }
};

describe('ensure-collections', () => {
  let ctx: IEnsureTestContext;

  beforeAll(async () => {
    ctx = await createEnsureTestContext();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  describe('parseArgs', () => {
    it('reads --target and defaults to a write run', () => {
      expect(parseArgs(['--target', 'mongodb://localhost:27017/x'])).toEqual({
        target: 'mongodb://localhost:27017/x',
        dryRun: false,
      });
    });

    it('reads --target=… inline and --dry-run', () => {
      expect(parseArgs(['--target=mongodb://h/x', '--dry-run'])).toEqual({
        target: 'mongodb://h/x',
        dryRun: true,
      });
    });

    it('refuses an unknown flag so a typo does not run a write', () => {
      expect(() => parseArgs(['--target', 'mongodb://h/x', '--dryrun'])).toThrow('Unknown flag --dryrun');
    });

    it('refuses a missing value', () => {
      expect(() => parseArgs(['--target'])).toThrow('--target needs a value');
    });

    it('refuses a bare positional argument', () => {
      expect(() => parseArgs(['mongodb://h/x'])).toThrow('Unexpected argument mongodb://h/x');
    });

    it('requires --target', () => {
      expect(() => parseArgs(['--dry-run'])).toThrow('Usage: ensure-collections');
    });
  });

  describe('run', () => {
    it('creates the four collections and every schema index', async () => {
      const code = await run({target: ctx.uri, dryRun: false}, {connect});
      expect(code).toBe(0);

      const users = await indexKeys(ctx.uri, 'users');
      expect(users).toContain(JSON.stringify({_id: 1}));
      expect(users).toContain(JSON.stringify({email: 1}));

      const clients = await indexKeys(ctx.uri, 'clients');
      expect(clients).toContain(JSON.stringify({name: 1}));
      // `data-model.md` § 2 names both client indexes; the compound one is what serves the list's
      // `{name: 1, _id: 1}` sort, and it is the schema's to declare (the tool binds the schema).
      expect(clients).toContain(JSON.stringify({name: 1, _id: 1}));

      const buildings = await indexKeys(ctx.uri, 'buildings');
      expect(buildings).toContain(JSON.stringify({city: 1, property: 1}));

      const bookings = await indexKeys(ctx.uri, 'bookings');
      expect(bookings).toContain(JSON.stringify({createdAt: -1, _id: -1}));
      expect(bookings).toContain(JSON.stringify({'place.city': 1, 'place.place': 1, 'bookedTimes.day': 1}));
      expect(bookings).toContain(JSON.stringify({clientId: 1, accepted: 1}));
    });

    it('is idempotent — a second run creates nothing new and exits 0', async () => {
      await run({target: ctx.uri, dryRun: false}, {connect});
      const before = await indexKeys(ctx.uri, 'bookings');

      const code = await run({target: ctx.uri, dryRun: false}, {connect});

      expect(code).toBe(0);
      expect(await indexKeys(ctx.uri, 'bookings')).toEqual(before);
    });

    it('a dry run creates nothing', async () => {
      await run({target: ctx.uri, dryRun: true}, {connect});

      const collections = await requireDb(ctx.connection).listCollections().toArray();
      expect(collections).toHaveLength(0);
    });

    // Mongoose defaults `autoCreate`/`autoIndex` to true and builds a model's indexes in the
    // background when the model is compiled — and building an index on a missing collection
    // *creates the collection*. So merely connecting and binding the models used to write, which
    // made `--dry-run` non-read-only and raced the explicit `createIndexes()` (the dry-run test
    // above flaked intermittently). `openConnection` turns both off; this pins that, waiting past
    // the point the background build would have landed so the assertion is about the write and
    // not about timing.
    it('binding the models creates nothing on its own', async () => {
      const connection = await connect(ctx.uri);
      try {
        bindModels(connection);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const collections = await requireDb(connection).listCollections().toArray();
        expect(collections).toHaveLength(0);
      } finally {
        await connection.close();
      }
    });

    it('enforces the {city, property} unique index it created', async () => {
      await run({target: ctx.uri, dryRun: false}, {connect});

      const connection = await connect(ctx.uri);
      try {
        const buildings = requireDb(connection).collection('buildings');
        await buildings.insertOne({city: 'siechnice', property: 'hala-sportowa'});
        await expect(
          buildings.insertOne({city: 'siechnice', property: 'hala-sportowa'}),
        ).rejects.toThrow();
        // A different city may reuse the same property key: uniqueness is per city.
        await expect(
          buildings.insertOne({city: 'wroclaw', property: 'hala-sportowa'}),
        ).resolves.toBeDefined();
      } finally {
        await connection.close();
      }
    });
  });

  describe('ensureOne', () => {
    it('ignores an already-existing collection', async () => {
      const [users] = bindModels(ctx.connection);
      await ensureOne(users);
      await expect(ensureOne(users)).resolves.toBeUndefined();
    });

    it('swallows the NamespaceExists error and still creates the indexes', async () => {
      const created: string[] = [];
      const existing = stubModel({
        createCollection: () => Promise.reject(Object.assign(new Error('exists'), {code: 48})),
        createIndexes: () => {
          created.push('indexes');
          return Promise.resolve();
        },
      });
      await expect(ensureOne(existing)).resolves.toBeUndefined();
      expect(created).toEqual(['indexes']);
    });

    it('re-throws a createCollection failure that is not NamespaceExists', async () => {
      const failing = stubModel({
        createCollection: () => Promise.reject(Object.assign(new Error('not authorised'), {code: 13})),
      });
      await expect(ensureOne(failing)).rejects.toThrow('not authorised');
    });
  });

  describe('isAlreadyExists', () => {
    it('is true for the driver’s NamespaceExists code and false otherwise', () => {
      expect(isAlreadyExists({code: 48})).toBe(true);
      expect(isAlreadyExists({code: 13})).toBe(false);
      expect(isAlreadyExists(new Error('boom'))).toBe(false);
      expect(isAlreadyExists(null)).toBe(false);
      expect(isAlreadyExists('48')).toBe(false);
    });
  });

  describe('isNamespaceNotFound', () => {
    it('is true for the driver’s NamespaceNotFound code and false otherwise', () => {
      expect(isNamespaceNotFound({code: 26})).toBe(true);
      expect(isNamespaceNotFound({code: 13})).toBe(false);
      expect(isNamespaceNotFound(new Error('boom'))).toBe(false);
      expect(isNamespaceNotFound(null)).toBe(false);
    });
  });

  describe('readIndexes', () => {
    it('reports no indexes for a collection that does not exist yet', async () => {
      const missing = stubModel({
        listIndexes: () => Promise.reject(Object.assign(new Error('ns not found'), {code: 26})),
      });
      await expect(readIndexes(missing)).resolves.toEqual([]);
    });

    it('re-throws a listIndexes failure that is not NamespaceNotFound', async () => {
      const failing = stubModel({
        listIndexes: () => Promise.reject(Object.assign(new Error('not authorised'), {code: 13})),
      });
      await expect(readIndexes(failing)).rejects.toThrow('not authorised');
    });
  });

  describe('report', () => {
    it('narrows a listIndexes row to its key, defaulting to an empty object', () => {
      expect(toIndexKeys({v: 2, key: {email: 1}, name: 'email_1'})).toEqual({email: 1});
      expect(toIndexKeys({v: 2, name: 'no-key'})).toEqual({});
    });

    it('prints each collection and its index keys', () => {
      const text = formatReport(
        {collections: [{collection: 'users', indexes: [{email: 1}]}]},
        false,
      );
      expect(text).toContain('Collections ensured.');
      expect(text).toContain('users:');
      expect(text).toContain('{"email":1}');
    });

    it('says a dry run wrote nothing', () => {
      const text = formatReport({collections: []}, true);
      expect(text).toContain('dry run');
      expect(text).toContain('nothing was written');
    });
  });
});
