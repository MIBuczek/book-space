import mongoose from 'mongoose';
import {bindModels} from './models';
import type {IBoundModel} from './models';
import {formatReport, toIndexKeys} from './report';
import type {IEnsureReport} from './report';

/**
 * `ensure-collections` (003 T116, data-model.md § 3).
 *
 * Creates the `book_space` collections and every index the server's schemas declare, before the
 * reference seed and the migration write (research R2). On Azure DocumentDB the ordering is good
 * practice rather than a hard requirement — a unique index can be added at any time on this tier
 * — but running it first means a partially-migrated database is never left without its
 * uniqueness rules.
 *
 * Everything is **idempotent**: `createCollection` on an existing collection is caught and
 * ignored, and `createIndexes` is a no-op when the index already exists with the same key and
 * options. Running the tool twice is therefore safe, which is what lets it be part of a
 * re-runnable deployment rather than a one-off.
 *
 * The connection is injected so a test drives the whole run against an ephemeral `mongod` — the
 * same seam `tools/migration` and `tools/backup` use, and for the same reason: the MongoDB
 * driver's dynamic `import('os')` is rejected by Jest's `vm` sandbox, so a test supplies a
 * `connect` that passes `runtimeAdapters: {os}` while `main.ts` uses the plain one.
 */

interface ICli {
  target: string;
  dryRun: boolean;
}

interface IRunDependencies {
  connect: (uri: string) => Promise<mongoose.Connection>;
}

/**
 * A tiny hand-rolled parser, like the other tools': the surface is small, and an unknown flag is
 * an error so a typo (`--dryrun`) fails loudly rather than running a write against the wrong
 * database.
 */
const parseArgs = (argv: string[]): ICli => {
  const flags = new Map<string, string | true>();
  const known = new Set(['target', 'dry-run']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument ${arg}`);
    }
    const [name, inline] = arg.slice(2).split('=');
    if (!known.has(name)) {
      throw new Error(`Unknown flag --${name}`);
    }
    if (name === 'dry-run') {
      flags.set(name, true);
      continue;
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

  const target = flags.get('target');
  if (typeof target !== 'string') {
    throw new Error('Usage: ensure-collections --target <mongodb-uri> [--dry-run]');
  }
  return {target, dryRun: flags.has('dry-run')};
};

/**
 * Whether a `createCollection` failure means "it already exists".
 *
 * MongoDB answers `NamespaceExists` (code 48) for a collection that is present. Matching on the
 * code rather than the message is what makes the check survive a server that words the error
 * differently — and a *different* failure (a permissions error, an unreachable host) must
 * propagate, because swallowing it would report a collection as ensured when it was not.
 */
const isAlreadyExists = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as {code?: number}).code === 48;

/**
 * Creates the collection if it is absent, then creates the schema's indexes.
 *
 * `createCollection` is called explicitly rather than left to `createIndexes`: creating an index
 * on a collection that does not exist also creates the collection, but naming the step makes the
 * report's "collection ensured" claim true of an empty collection too, which is the state the
 * deployment needs before the seed writes the first facility.
 */
const ensureOne = async (bound: IBoundModel): Promise<void> => {
  try {
    await bound.model.createCollection();
  } catch (error) {
    if (!isAlreadyExists(error)) {
      throw error;
    }
  }
  await bound.model.createIndexes();
};

/**
 * Whether a `listIndexes` failure means "the collection is not there yet".
 *
 * A dry run reads indexes before anything is created, so a missing collection is expected rather
 * than an error; MongoDB answers `NamespaceNotFound` (code 26). Any other failure propagates.
 */
const isNamespaceNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as {code?: number}).code === 26;

/**
 * Reads the index keys back off a collection, so the report reflects the server, not the plan.
 *
 * A collection that does not exist yet reports no indexes rather than failing the run, which is
 * what lets a dry run inspect a fresh database without creating anything.
 */
const readIndexes = async (bound: IBoundModel): Promise<Array<Record<string, number | string>>> => {
  try {
    const indexes = await bound.model.listIndexes();
    return indexes.map(toIndexKeys);
  } catch (error) {
    if (isNamespaceNotFound(error)) {
      return [];
    }
    throw error;
  }
};

/**
 * Runs the command and returns the process exit code.
 *
 * `0` means every collection exists and its indexes are present. A `--dry-run` connects and
 * reports the indexes that are already there without creating anything, which is how an operator
 * inspects a database before changing it.
 */
const run = async (cli: ICli, dependencies: IRunDependencies): Promise<number> => {
  const connection = await dependencies.connect(cli.target);
  try {
    const bound = bindModels(connection);
    if (!cli.dryRun) {
      for (const model of bound) {
        await ensureOne(model);
      }
    }
    const report: IEnsureReport = {
      collections: [],
    };
    for (const model of bound) {
      report.collections.push({collection: model.collection, indexes: await readIndexes(model)});
    }
    console.log(formatReport(report, cli.dryRun));
  } finally {
    await connection.close();
  }
  return 0;
};

export {parseArgs, run, ensureOne, readIndexes, isAlreadyExists, isNamespaceNotFound};
export type {ICli, IRunDependencies};
