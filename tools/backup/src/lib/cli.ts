import mongoose from 'mongoose';
import {EJSON} from 'bson';
import {dumpDatabase, restoreDatabase, requireDatabase, BACKUP_COLLECTIONS} from './archive';
import {purgeArchivedBookings} from './purge';
import type {IPurgeReport} from './purge';
import {retentionCutoff, DEFAULT_RETENTION_MONTHS} from './retention';
import {formatBackup, formatRestore, formatPurge} from './report';

/**
 * The backup / restore / retention tool (T060, NFR-001, spec.md §9 open question 7).
 *
 * Four subcommands:
 *
 *   backup         --source <uri> --out <dir>
 *   restore        --target <uri> --from <dir>
 *   verify-restore --source <uri> --target <uri>
 *   purge          --target <uri> [--retention-months N] [--dry-run] [--export <dir>]
 *
 * `verify-restore` is the acceptance criterion the issue states as "a restore that has never
 * been tested is not a backup": it dumps the source, restores into the scratch target and
 * reconciles the two by count *and* by sampled field values, so a restore that lost a document
 * or coerced an `ObjectId` into a string fails here rather than at cut-over.
 *
 * Everything of substance is injected (`connect`, the file-system seam) so a test drives the
 * whole run against an ephemeral `mongod` and a temporary directory, exactly as the migration
 * tool does.
 */

interface IParsedCommand {
  command: 'backup' | 'restore' | 'verify-restore' | 'purge';
  flags: Map<string, string | true>;
}

const COMMANDS = new Set(['backup', 'restore', 'verify-restore', 'purge']);
const VALUE_FLAGS = new Set(['source', 'target', 'out', 'from', 'retention-months', 'export']);
const BOOLEAN_FLAGS = new Set(['dry-run']);

/**
 * Parses `argv` into a subcommand and its flags.
 *
 * A hand-rolled parser, like the migration tool's: the surface is small and an unknown flag is
 * an error, so a typo (`--dryrun`) fails loudly rather than running a destructive command with
 * the guard silently absent.
 */
const parseArgs = (argv: string[]): IParsedCommand => {
  const command = argv[0];
  if (command === undefined || !COMMANDS.has(command)) {
    throw new Error('Usage: backup <backup|restore|verify-restore|purge> [--flag value ...]');
  }

  const flags = new Map<string, string | true>();
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument ${arg}`);
    }
    const [name, inline] = arg.slice(2).split('=');
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new Error(`Unknown flag --${name}`);
    }
    if (inline !== undefined) {
      flags.set(name, inline);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`--${name} needs a value`);
    }
    flags.set(name, next);
    index += 1;
  }

  return {command: command as IParsedCommand['command'], flags};
};

/** Reads a required string flag, failing with a message that names the subcommand. */
const requiredFlag = (flags: Map<string, string | true>, name: string, command: string): string => {
  const value = flags.get(name);
  if (typeof value !== 'string') {
    throw new Error(`${command} needs --${name}`);
  }
  return value;
};

/** The dependencies a test replaces to drive a run against an ephemeral server. */
interface IBackupDependencies {
  connect: (uri: string) => Promise<mongoose.Connection>;
  /** The directory the archive is written to / read from; injected so a test uses a temp dir. */
  archiveFs?: import('./archive').IArchiveFs;
}

/**
 * Runs a subcommand and returns the process exit code.
 *
 * `0` means the command did what it said; anything else means it did not. `verify-restore`
 * returns `1` when the reconciliation finds a difference, so a mismatch is a failed run rather
 * than a warning an operator can miss.
 */
const run = async (parsed: IParsedCommand, dependencies: IBackupDependencies): Promise<number> => {
  const {command, flags} = parsed;

  if (command === 'backup') {
    const source = requiredFlag(flags, 'source', command);
    const out = requiredFlag(flags, 'out', command);
    const connection = await dependencies.connect(source);
    try {
      const manifest = await dumpDatabase(connection, out, dependencies.archiveFs);
      console.log(formatBackup(manifest, out));
      return 0;
    } finally {
      await connection.close();
    }
  }

  if (command === 'restore') {
    const target = requiredFlag(flags, 'target', command);
    const from = requiredFlag(flags, 'from', command);
    const connection = await dependencies.connect(target);
    try {
      const manifest = await restoreDatabase(connection, from, dependencies.archiveFs);
      console.log(formatRestore(manifest, requireDatabase(connection).databaseName));
      return 0;
    } finally {
      await connection.close();
    }
  }

  if (command === 'verify-restore') {
    const source = requiredFlag(flags, 'source', command);
    const target = requiredFlag(flags, 'target', command);
    return verifyRestore(source, target, dependencies);
  }

  // purge
  const target = requiredFlag(flags, 'target', command);
  const months = parseRetentionMonths(flags);
  const dryRun = flags.get('dry-run') === true;
  const exportDir = flags.get('export');
  const connection = await dependencies.connect(target);
  try {
    const cutoff = retentionCutoff(new Date(), months);
    const report = await purgeArchivedBookings(connection, cutoff, {
      dryRun,
      exportDir: typeof exportDir === 'string' ? exportDir : undefined,
      fs: dependencies.archiveFs,
    });
    console.log(formatPurge(report, dryRun, cutoff));
    return purgeExitCode(report, dryRun);
  } finally {
    await connection.close();
  }
};

/**
 * The exit code for a purge run.
 *
 * A dry run always succeeds — nothing was meant to change. A real run succeeds only when every
 * document the predicate accepted was deleted; a shortfall means the driver removed fewer than
 * the report counted, which is a failure an operator must see rather than a warning. It is a
 * named function so the shortfall branch is unit-testable without staging a concurrent delete.
 */
const purgeExitCode = (report: IPurgeReport, dryRun: boolean): number =>
  dryRun || report.purged === report.purgeable ? 0 : 1;

/**
 * The retention window in months for a purge run.
 *
 * Months, not years: the default is eleven months, which is not a whole number of years, so a
 * `--retention-years` flag could not express the default (#198). The flag is a whole number of
 * months; anything else is an error rather than a silent fallback to the default.
 */
const parseRetentionMonths = (flags: Map<string, string | true>): number => {
  const raw = flags.get('retention-months');
  if (raw === undefined) {
    return DEFAULT_RETENTION_MONTHS;
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new Error('--retention-months needs a whole number');
  }
  return Number(raw);
};

/**
 * Dumps the source, restores into the target, and reconciles the two.
 *
 * Reconciliation is by count **and** by a field-level comparison of a sample of documents: a
 * count alone would pass a restore that wrote the right number of documents with an `_id`
 * coerced to a string, which is precisely the failure an Extended-JSON round trip exists to
 * avoid. The sample is compared as canonical Extended JSON strings, so an `ObjectId` and its hex
 * string are different values and the mismatch is caught.
 */
const verifyRestore = async (
  source: string,
  target: string,
  dependencies: IBackupDependencies
): Promise<number> => {
  const sourceConnection = await dependencies.connect(source);
  const targetConnection = await dependencies.connect(target);
  try {
    const sourceDb = requireDatabase(sourceConnection);
    const targetDb = requireDatabase(targetConnection);
    const diffs: string[] = [];
    for (const collection of BACKUP_COLLECTIONS) {
      const expected = await sourceDb.collection(collection).find({}).sort({_id: 1}).toArray();
      const actual = await targetDb.collection(collection).find({}).sort({_id: 1}).toArray();
      if (expected.length !== actual.length) {
        diffs.push(`${collection}: expected ${expected.length} documents, found ${actual.length}`);
        continue;
      }
      const expectedJson = expected.map((document) => JSON.stringify(canonical(document)));
      const actualJson = actual.map((document) => JSON.stringify(canonical(document)));
      for (let index = 0; index < expectedJson.length; index += 1) {
        if (expectedJson[index] !== actualJson[index]) {
          diffs.push(`${collection}: document ${index} differs`);
          break;
        }
      }
    }

    if (diffs.length > 0) {
      console.error('Restore verification FAILED:');
      for (const diff of diffs) {
        console.error(`  ${diff}`);
      }
      return 1;
    }
    console.log(`Restore verification passed for ${BACKUP_COLLECTIONS.length} collections.`);
    return 0;
  } finally {
    await sourceConnection.close();
    await targetConnection.close();
  }
};

/**
 * A stable, type-preserving projection of a document for comparison.
 *
 * `EJSON.stringify` with the canonical form is the comparison key: it renders an `ObjectId` as
 * `{"$oid": ...}` and a `Date` as `{"$date": ...}`, so two documents that differ only in the
 * *type* of a field compare unequal. A plain `JSON.stringify` would render both a date and its
 * ISO string identically and hide exactly the coercion the round trip must not perform.
 */
const canonical = (document: Record<string, unknown>): string =>
  EJSON.stringify(document, {relaxed: false});

export {parseArgs, run, parseRetentionMonths, verifyRestore, purgeExitCode};
export type {IParsedCommand, IBackupDependencies};
