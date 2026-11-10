import mongoose from 'mongoose';
import {ObjectId} from 'bson';
import {promises as fs} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {dumpDatabase, restoreDatabase, readManifest, requireDatabase} from './archive';
import {createBackupTestContext} from '../testing/mongo-test-context';
import type {IBackupTestContext} from '../testing/mongo-test-context';

/**
 * The backup/restore round trip against two real `mongod`s (T060).
 *
 * This is the "a restore that has never been tested is not a backup" acceptance criterion: the
 * dump is read back through a real restore, and the types that a naive JSON copy would mangle —
 * `ObjectId` and `Date` — are asserted to survive as their original types, not as the strings
 * that merely look like them.
 */
describe('archive dump and restore', () => {
  let context: IBackupTestContext;
  let dir: string;

  beforeAll(async () => {
    context = await createBackupTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-spec-'));
    await context.source.db?.dropDatabase();
    await context.target.db?.dropDatabase();
  });

  afterEach(async () => {
    await fs.rm(dir, {recursive: true, force: true});
  });

  const seedSource = async () => {
    const db = context.source.db;
    if (!db) {
      throw new Error('no db');
    }
    await db.collection('users').insertOne({_id: new ObjectId(), email: 'a@sisk.pl', role: 'ADMIN'});
    await db.collection('clients').insertOne({_id: new ObjectId(), name: 'Klient', type: 'COMPANY', nip: '123-456-32-18'});
    await db.collection('buildings').insertOne({_id: new ObjectId(), city: 'Siechnice', property: 'hala', sizes: ['FULL']});
    await db.collection('bookings').insertOne({
      _id: new ObjectId(),
      type: 'INDIVIDUAL',
      nick: 'Jan K',
      archive: false,
      accepted: true,
      createdAt: new Date('2021-05-05T10:00:00.000Z'),
      bookedTimes: [{day: new Date('2021-06-01T00:00:00.000Z'), startHours: 8, endHours: 10, participants: 1, status: 'INITIAL'}],
    });
  };

  it('writes one file per collection and a manifest with the counts', async () => {
    await seedSource();
    const manifest = await dumpDatabase(context.source, dir);

    expect(manifest.counts).toEqual({users: 1, clients: 1, buildings: 1, bookings: 1});
    expect(manifest.sourceDatabase).toBe('book_space_backup_source');
    for (const collection of ['users', 'clients', 'buildings', 'bookings']) {
      await expect(fs.access(path.join(dir, `${collection}.json`))).resolves.toBeUndefined();
    }
    await expect(fs.access(path.join(dir, 'manifest.json'))).resolves.toBeUndefined();
  });

  it('restores every document with ObjectId and Date types intact', async () => {
    await seedSource();
    await dumpDatabase(context.source, dir);
    await restoreDatabase(context.target, dir);

    const target = context.target.db;
    if (!target) {
      throw new Error('no db');
    }
    const booking = await target.collection('bookings').findOne({});
    // The id is a real ObjectId, not the hex string a plain-JSON copy would produce.
    expect(booking?.['_id']).toBeInstanceOf(ObjectId);
    expect(booking?.['createdAt']).toBeInstanceOf(Date);
    expect((booking?.['bookedTimes'] as Array<{day: Date}>)[0].day).toBeInstanceOf(Date);
    expect((booking?.['createdAt'] as Date).toISOString()).toBe('2021-05-05T10:00:00.000Z');
  });

  it('replaces the target rather than merging into it', async () => {
    await seedSource();
    await dumpDatabase(context.source, dir);
    // A leftover document the archive does not contain must not survive the restore.
    await context.target.db?.collection('clients').insertOne({_id: new ObjectId(), name: 'Stale'});
    await restoreDatabase(context.target, dir);
    expect(await context.target.db?.collection('clients').countDocuments()).toBe(1);
  });

  it('reports the written counts in the restored manifest', async () => {
    await seedSource();
    await dumpDatabase(context.source, dir);
    const restored = await restoreDatabase(context.target, dir);
    expect(restored.counts).toEqual({users: 1, clients: 1, buildings: 1, bookings: 1});
  });

  it('round-trips an empty archive', async () => {
    await dumpDatabase(context.source, dir);
    const restored = await restoreDatabase(context.target, dir);
    expect(restored.counts).toEqual({users: 0, clients: 0, buildings: 0, bookings: 0});
  });

  it('reads the manifest back', async () => {
    await seedSource();
    const written = await dumpDatabase(context.source, dir);
    const read = await readManifest(dir);
    expect(read).toEqual(written);
  });

  it('refuses a connection with no database handle', async () => {
    // A connection that was created but never opened has no `.db`; the guard must refuse it
    // rather than dereference `undefined`.
    const bare = mongoose.createConnection();
    await expect(dumpDatabase(bare, dir)).rejects.toThrow('The connection has no database handle');
    await expect(restoreDatabase(bare, dir)).rejects.toThrow('The connection has no database handle');
    await bare.close();
  });

  it('requireDatabase returns the handle for an open connection', () => {
    expect(requireDatabase(context.source).databaseName).toBe('book_space_backup_source');
  });
});
