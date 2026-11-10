import mongoose from 'mongoose';
import {ObjectId} from 'bson';
import {promises as fs} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {parseArgs, run, parseRetentionYears, verifyRestore, purgeExitCode} from './cli';
import {dumpDatabase} from './archive';
import {createBackupTestContext} from '../testing/mongo-test-context';
import type {IBackupTestContext} from '../testing/mongo-test-context';

/**
 * The tool's command surface (T060).
 *
 * The pure argument parsing is pinned directly; the subcommands are driven end to end through a
 * real `connect` against the ephemeral server, so the wiring (`parseArgs` → `run` → exit code)
 * is exercised rather than assumed.
 */
describe('parseArgs', () => {
  it('reads a subcommand and its value flags', () => {
    const parsed = parseArgs(['backup', '--source', 'mongodb://a', '--out', '/tmp/x']);
    expect(parsed.command).toBe('backup');
    expect(parsed.flags.get('source')).toBe('mongodb://a');
    expect(parsed.flags.get('out')).toBe('/tmp/x');
  });

  it('accepts the inline `--flag=value` form', () => {
    const parsed = parseArgs(['purge', '--target=mongodb://a', '--retention-years=7']);
    expect(parsed.flags.get('target')).toBe('mongodb://a');
    expect(parsed.flags.get('retention-years')).toBe('7');
  });

  it('accepts a boolean flag with no value', () => {
    expect(parseArgs(['purge', '--target', 'mongodb://a', '--dry-run']).flags.get('dry-run')).toBe(true);
  });

  it('rejects a missing or unknown subcommand', () => {
    expect(() => parseArgs([])).toThrow('Usage');
    expect(() => parseArgs(['nonsense'])).toThrow('Usage');
  });

  it('rejects a bare positional argument', () => {
    expect(() => parseArgs(['backup', 'oops'])).toThrow('Unexpected argument oops');
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['backup', '--dryrun'])).toThrow('Unknown flag --dryrun');
  });

  it('rejects a value flag with no value', () => {
    expect(() => parseArgs(['backup', '--source'])).toThrow('--source needs a value');
    expect(() => parseArgs(['backup', '--source', '--out', 'x'])).toThrow('--source needs a value');
  });
});

describe('parseRetentionYears', () => {
  it('defaults when the flag is absent', () => {
    expect(parseRetentionYears(new Map())).toBe(5);
  });

  it('reads a whole number', () => {
    expect(parseRetentionYears(new Map([['retention-years', '10']]))).toBe(10);
  });

  it('rejects a non-numeric value', () => {
    expect(() => parseRetentionYears(new Map([['retention-years', 'ten']]))).toThrow('whole number');
    expect(() => parseRetentionYears(new Map([['retention-years', true]]))).toThrow('whole number');
  });
});

describe('purgeExitCode', () => {
  it('succeeds for a dry run regardless of the counts', () => {
    expect(purgeExitCode({candidates: 1, purgeable: 1, purged: 0, skipped: 0}, true)).toBe(0);
  });

  it('succeeds when every purgeable document was deleted', () => {
    expect(purgeExitCode({candidates: 3, purgeable: 3, purged: 3, skipped: 0}, false)).toBe(0);
  });

  it('fails when fewer documents were deleted than intended', () => {
    expect(purgeExitCode({candidates: 3, purgeable: 3, purged: 2, skipped: 0}, false)).toBe(1);
  });
});

describe('run', () => {
  let context: IBackupTestContext;
  let dir: string;

  beforeAll(async () => {
    context = await createBackupTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-spec-'));
    await context.source.db?.dropDatabase();
    await context.target.db?.dropDatabase();
    await context.source.db?.collection('clients').insertOne({_id: new ObjectId(), name: 'Klient'});
  });

  afterEach(async () => {
    await fs.rm(dir, {recursive: true, force: true});
  });

  // The real `connect`, with the test-only `runtimeAdapters` escape hatch the driver documents
  // for Jest's `vm` sandbox (the same trap `testing/mongo-test-context.ts` explains): without it
  // the driver's dynamic `import('os')` is rejected and the handshake hangs.
  const deps = {
    connect: (uri: string) => mongoose.createConnection(uri, {runtimeAdapters: {os}}).asPromise(),
  };

  it('backs up and restores end to end', async () => {
    expect(await run(parseArgs(['backup', '--source', context.sourceUri, '--out', dir]), deps)).toBe(0);
    expect(await run(parseArgs(['restore', '--target', context.targetUri, '--from', dir]), deps)).toBe(0);
    expect(await context.target.db?.collection('clients').countDocuments()).toBe(1);
  });

  it('verifies a good restore and fails a bad one', async () => {
    expect(await run(parseArgs(['backup', '--source', context.sourceUri, '--out', dir]), deps)).toBe(0);
    expect(await run(parseArgs(['restore', '--target', context.targetUri, '--from', dir]), deps)).toBe(0);
    expect(
      await run(parseArgs(['verify-restore', '--source', context.sourceUri, '--target', context.targetUri]), deps)
    ).toBe(0);

    // A document the source does not have makes the counts differ, which is a failed restore.
    await context.target.db?.collection('clients').insertOne({_id: new ObjectId(), name: 'Extra'});
    expect(
      await run(parseArgs(['verify-restore', '--source', context.sourceUri, '--target', context.targetUri]), deps)
    ).toBe(1);
  });

  it('reports a missing required flag', async () => {
    await expect(run(parseArgs(['backup', '--out', dir]), deps)).rejects.toThrow('backup needs --source');
  });

  it('purges with a dry run and then for real', async () => {
    await context.source.db?.collection('bookings').insertOne({
      _id: new ObjectId(),
      archive: true,
      bookedTimes: [{day: new Date('2000-01-01T00:00:00.000Z')}],
    });
    expect(await run(parseArgs(['purge', '--target', context.sourceUri, '--dry-run']), deps)).toBe(0);
    expect(await context.source.db?.collection('bookings').countDocuments()).toBe(1);
    expect(
      await run(
        parseArgs(['purge', '--target', context.sourceUri, '--retention-years=5', '--export', dir]),
        deps
      )
    ).toBe(0);
    expect(await context.source.db?.collection('bookings').countDocuments()).toBe(0);
    await expect(fs.access(`${dir}/purged-bookings.json`)).resolves.toBeUndefined();
  });
});

describe('verifyRestore', () => {
  let context: IBackupTestContext;
  let dir: string;

  beforeAll(async () => {
    context = await createBackupTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-spec-'));
    await context.source.db?.dropDatabase();
    await context.target.db?.dropDatabase();
  });

  afterEach(async () => {
    await fs.rm(dir, {recursive: true, force: true});
  });

  const deps = {
    connect: (uri: string) => mongoose.createConnection(uri, {runtimeAdapters: {os}}).asPromise(),
  };

  it('fails when a document differs in value but not in count', async () => {
    await context.source.db?.collection('clients').insertOne({_id: new ObjectId(), name: 'Klient'});
    await dumpDatabase(context.source, dir);
    // Restore, then mutate a field so the counts match but a document differs.
    await run(parseArgs(['restore', '--target', context.targetUri, '--from', dir]), deps);
    await context.target.db?.collection('clients').updateOne({}, {$set: {name: 'Zmieniony'}});
    expect(await verifyRestore(context.sourceUri, context.targetUri, deps)).toBe(1);
  });

  it('fails when a connection has no database handle', async () => {
    const bare = mongoose.createConnection();
    await expect(verifyRestore('mongodb://127.0.0.1:1/x', context.targetUri, {connect: async () => bare})).rejects.toThrow(
      'The connection has no database handle'
    );
    await bare.close();
  });
});
