import mongoose from 'mongoose';
import {ObjectId} from 'bson';
import {promises as fs} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {EJSON} from 'bson';
import {purgeArchivedBookings, PURGE_EXPORT_FILE} from './purge';
import {createBackupTestContext} from '../testing/mongo-test-context';
import type {IBackupTestContext} from '../testing/mongo-test-context';

/**
 * The retention purge against a real `mongod` (T060, spec.md §9 open question 7).
 *
 * The pure rule is pinned in `retention.spec.ts`; this spec proves the tool applies it through
 * the database — that a dry run deletes nothing, that a real run deletes exactly the purgeable
 * set, and that the export written before a delete can be read back.
 */
describe('purgeArchivedBookings', () => {
  let context: IBackupTestContext;
  let dir: string;
  const cutoff = new Date('2021-01-01T00:00:00.000Z');

  beforeAll(async () => {
    context = await createBackupTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purge-spec-'));
    await context.source.db?.dropDatabase();
  });

  afterEach(async () => {
    await fs.rm(dir, {recursive: true, force: true});
  });

  const insert = async (document: Record<string, unknown>) => {
    await context.source.db?.collection('bookings').insertOne({_id: new ObjectId(), ...document});
  };

  const oldArchived = {archive: true, bookedTimes: [{day: new Date('2020-01-01T00:00:00.000Z')}]};
  const recentArchived = {archive: true, bookedTimes: [{day: new Date('2022-01-01T00:00:00.000Z')}]};
  const oldActive = {archive: false, bookedTimes: [{day: new Date('2020-01-01T00:00:00.000Z')}]};

  it('deletes only the archived bookings past the cutoff', async () => {
    await insert(oldArchived);
    await insert(recentArchived);
    await insert(oldActive);

    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: false});
    expect(report).toMatchObject({purgeable: 1, purged: 1, skipped: 0});
    expect(await context.source.db?.collection('bookings').countDocuments()).toBe(2);
    // The survivors are the recent archived one and the active one.
    expect(await context.source.db?.collection('bookings').countDocuments({archive: true})).toBe(1);
  });

  it('deletes nothing in a dry run', async () => {
    await insert(oldArchived);
    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: true});
    expect(report).toMatchObject({candidates: 1, purgeable: 1, purged: 0});
    expect(await context.source.db?.collection('bookings').countDocuments()).toBe(1);
  });

  it('skips an archived booking with no slots, which the filter must not match', async () => {
    // The filter uses `bookedTimes.0` `$exists` to exclude these; the predicate refuses them
    // again, so `skipped` is the counter that would move if the filter widened.
    await insert({archive: true, bookedTimes: []});
    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: false});
    expect(report).toMatchObject({candidates: 0, purgeable: 0, purged: 0});
    expect(await context.source.db?.collection('bookings').countDocuments()).toBe(1);
  });

  it('writes the removed documents to an export before deleting', async () => {
    await insert(oldArchived);
    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: false, exportDir: dir});
    expect(report.exportFile).toBe(`${dir}/${PURGE_EXPORT_FILE}`);

    const exported = EJSON.parse(await fs.readFile(`${dir}/${PURGE_EXPORT_FILE}`, 'utf8'), {relaxed: false}) as Array<Record<string, unknown>>;
    expect(exported).toHaveLength(1);
    expect(exported[0]['_id']).toBeInstanceOf(ObjectId);
    expect(exported[0]['archive']).toBe(true);
    // The export carries the full document, including the slot the anchor was read from.
    expect(exported[0]['bookedTimes']).toHaveLength(1);
  });

  it('uses an injected file-system seam for the export', async () => {
    await insert(oldArchived);
    const calls: string[] = [];
    const stub = {
      mkdir: async (d: string) => { calls.push(`mkdir ${d}`); },
      writeFile: async (f: string) => { calls.push(`write ${f}`); },
      readFile: async () => '',
    };
    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: false, exportDir: dir, fs: stub});
    expect(report.exportFile).toBe(`${dir}/${PURGE_EXPORT_FILE}`);
    expect(calls).toContain(`mkdir ${dir}`);
    expect(calls).toContain(`write ${dir}/${PURGE_EXPORT_FILE}`);
  });

  it('does not write an export in a dry run', async () => {
    await insert(oldArchived);
    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: true, exportDir: dir});
    expect(report.exportFile).toBeUndefined();
    await expect(fs.access(`${dir}/${PURGE_EXPORT_FILE}`)).rejects.toThrow();
  });

  it('does nothing when the candidate set is empty', async () => {
    const report = await purgeArchivedBookings(context.source, cutoff, {dryRun: false, exportDir: dir});
    expect(report).toMatchObject({candidates: 0, purgeable: 0, purged: 0});
    await expect(fs.access(`${dir}/${PURGE_EXPORT_FILE}`)).rejects.toThrow();
  });

  it('refuses a connection with no database handle', async () => {
    const bare = mongoose.createConnection();
    await expect(purgeArchivedBookings(bare, cutoff, {dryRun: true})).rejects.toThrow('The connection has no database handle');
    await bare.close();
  });
});
