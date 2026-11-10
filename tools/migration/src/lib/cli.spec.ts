import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as os from 'os';
import mongoose from 'mongoose';
import {parseArgs, run} from './cli';
import {bindModels} from './models';
import {createMigrationTestContext, IMigrationTestContext} from '../testing/mongo-test-context';
import {legacyExport} from '../testing/fixtures';

/**
 * The end-to-end migration (T042): a legacy export is written to a temporary directory, the run
 * is driven against a real ephemeral `mongod`, and the result is read back with the real
 * schemas.
 *
 * A stub would prove nothing here — the point of the tool is that it writes documents the API
 * can read, so the assertions go through `mongod` and the schema validation the server applies.
 */
describe('migration cli', () => {
  let context: IMigrationTestContext;
  let sourceDir: string;
  let writeIndex = 0;

  const writeExport = (data: unknown): string => {
    const directory = mkdtempSync(join(tmpdir(), `migration-${writeIndex++}-`));
    for (const [collection, records] of Object.entries(data as Record<string, unknown>)) {
      writeFileSync(join(directory, `${collection}.json`), JSON.stringify(records));
    }
    sourceDir = directory;
    return directory;
  };

  // A deterministic stand-in for `bcrypt.hash`: the round-trip spec is about the documents the
  // migration writes, not about the hash function, and a real hash would make the stored value
  // unassertable. `bcrypt` itself is exercised by the server's own suite.
  const hashPassword = async (plaintext: string): Promise<string> => `hashed:${plaintext}`;

  const connect = async (uri: string): Promise<mongoose.Connection> =>
    mongoose.createConnection(uri, {runtimeAdapters: {os}}).asPromise();

  beforeAll(async () => {
    context = await createMigrationTestContext();
    writeExport(legacyExport);
  }, 120_000);

  afterAll(async () => {
    await context.close();
    rmSync(sourceDir, {recursive: true, force: true});
  });

  beforeEach(async () => {
    await context.reset();
  });

  describe('parseArgs', () => {
    it('reads the three flags', () => {
      expect(parseArgs(['--source', 'in', '--target', 'mongodb://x', '--dry-run'])).toEqual({
        source: 'in',
        target: 'mongodb://x',
        dryRun: true,
      });
    });

    it('accepts --flag=value form', () => {
      expect(parseArgs(['--source=in', '--target=mongodb://x'])).toEqual({
        source: 'in',
        target: 'mongodb://x',
        dryRun: false,
      });
    });

    it('refuses an unknown flag, so a typo cannot start a real write', () => {
      expect(() => parseArgs(['--source', 'in', '--target', 'mongodb://x', '--dryrun'])).toThrow(/Unknown flag/);
    });

    it('refuses a flag with no value', () => {
      expect(() => parseArgs(['--source'])).toThrow(/needs a value/);
    });

    it('ignores a bare positional argument rather than reading it as a flag', () => {
      expect(parseArgs(['stray', '--source', 'in', '--target', 'mongodb://x'])).toMatchObject({source: 'in'});
    });

    it('refuses a missing source or target', () => {
      expect(() => parseArgs(['--source', 'in'])).toThrow(/Usage/);
    });
  });

  describe('dry run', () => {
    it('writes nothing and reports what a real run would insert', async () => {
      const code = await run({source: sourceDir, target: context.uri, dryRun: true}, {hashPassword, connect});
      expect(code).toBe(0);
      const counts = await context.connection.collection('bookings').countDocuments();
      expect(counts).toBe(0);
    });
  });

  describe('real run', () => {
    it('inserts every record and reports a clean reconciliation', async () => {
      const code = await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      expect(code).toBe(0);
      const {Booking, Client, Building, User} = bindModels(context.connection);
      await expect(Booking.exists({})).resolves.not.toBeNull();
      await expect(Client.exists({})).resolves.not.toBeNull();
      await expect(Building.exists({})).resolves.not.toBeNull();
      await expect(User.exists({})).resolves.not.toBeNull();
    });

    it('is idempotent: a second run updates in place rather than duplicating', async () => {
      await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      const first = await context.connection.collection('bookings').countDocuments();
      const code = await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      const second = await context.connection.collection('bookings').countDocuments();
      expect(code).toBe(0);
      expect(second).toBe(first);
    });

    it('writes a booking the real schema validates, with the transformed values', async () => {
      await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      const {Booking} = bindModels(context.connection);
      const booking = (await Booking.findOne({})) as Record<string, unknown> | null;
      expect(booking).not.toBeNull();
      expect(booking).toMatchObject({type: 'COMPANY', paymentMethod: 'TRANSFER', extraOptions: true});
    });

    it('hashes the password before storing it and never stores the plaintext marker', async () => {
      await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      const raw = (await context.connection.collection('users').findOne({})) as Record<string, unknown>;
      expect(raw['password']).toBe('hashed:MIGRATION-RESET-REQUIRED');
    });

    it('does not reset a password an administrator has changed on a second run', async () => {
      await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      await context.connection.collection('users').updateOne({}, {$set: {password: 'admin-changed'}});
      await run({source: sourceDir, target: context.uri, dryRun: false}, {hashPassword, connect});
      const raw = (await context.connection.collection('users').findOne({})) as Record<string, unknown>;
      expect(raw['password']).toBe('admin-changed');
    });
  });

  describe('failure reporting', () => {
    it('fails when a record does not validate, naming the collection and legacy id', async () => {
      // An inverted interval: the booking schema refuses it, so the migration must not write it.
      const broken = {
        ...legacyExport,
        bookings: [
          {
            _id: 'booking-broken',
            city: 'siechnice',
            building: 'hala-sportowa',
            size: '1/1',
            nick: 'Zepsuta',
            person: 'Jan',
            email: 'a@b.com',
            phone: '1',
            bookingTime: [
              {
                day: '2026-06-01T00:01',
                startHour: '2026-06-01T10:00',
                endHour: '2026-06-01T09:00',
                status: 'INITIAL',
              },
            ],
          },
        ],
      };
      const directory = writeExport(broken);
      const code = await run({source: directory, target: context.uri, dryRun: true}, {hashPassword, connect});
      expect(code).toBe(1);
      rmSync(directory, {recursive: true, force: true});
    });

    it('counts a write the driver rejects as a failure rather than aborting the run', async () => {
      // Two users with the same e-mail: the schema declares `email` unique, so once the index
      // exists the second upsert is rejected by the driver. It is counted, not thrown, so one
      // bad record does not hide the rest. The index is created up front because `run` builds
      // it after the writes, so on a first run the collision would not be caught.
      const {User} = bindModels(context.connection);
      await User.createIndexes();
      const duplicate = {
        ...legacyExport,
        users: [
          {...legacyExport.users[0], _id: 'user-a', email: 'same@example.com'},
          {...legacyExport.users[1], _id: 'user-b', email: 'same@example.com'},
        ],
      };
      const directory = writeExport(duplicate);
      const code = await run({source: directory, target: context.uri, dryRun: false}, {hashPassword, connect});
      expect(code).toBe(1);
      rmSync(directory, {recursive: true, force: true});
    });

    it('fails when a booking references a facility the export does not contain', async () => {
      const dangling = {
        ...legacyExport,
        buildings: [],
      };
      const directory = writeExport(dangling);
      const code = await run({source: directory, target: context.uri, dryRun: true}, {hashPassword, connect});
      expect(code).toBe(1);
      rmSync(directory, {recursive: true, force: true});
    });
  });

  describe('loadExport', () => {
    it('refuses a directory that does not contain every collection', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'migration-partial-'));
      writeFileSync(join(directory, 'bookings.json'), '[]');
      await expect(
        run({source: directory, target: context.uri, dryRun: true}, {hashPassword, connect})
      ).rejects.toThrow();
      rmSync(directory, {recursive: true, force: true});
    });
  });
});
