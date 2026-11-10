import mongoose from 'mongoose';
import {COLLECTIONS, ILegacyExport, TCollection} from './legacy';
import {loadExport} from './loader';
import {bindModels, IDbModel, IMigrationModels} from './models';
import {formatReport, isClean} from './report';
import {IReconciliationReport, IWritePlan, countReferences, emptyReport, planWrites, toUpdate} from './runner';

/**
 * The Firebase → MongoDB migration (FR-042, research.md R10): argument parsing, the run itself,
 * and the reconciliation report.
 *
 * The tool is deliberately **not** part of the server bundle: a migration that shipped inside the
 * API would run against production on every boot and would have no independent test surface
 * (plan.md Complexity Tracking). It is an Nx project (`tools/migration`) with its own
 * `run`/`test`/`lint` targets, and `main.ts` is the three-line bootstrap that calls `run`.
 *
 * `--dry-run` validates and counts without writing, which is the mode T043's rehearsal uses
 * against a staging database before cut-over.
 */

interface ICli {
  source: string;
  target: string;
  dryRun: boolean;
}

/**
 * The two side-effecting dependencies, injected so a test can drive the whole run against an
 * ephemeral `mongod`.
 *
 * `connect` is the one that matters: the MongoDB driver resolves its `os` adapter with a
 * dynamic `import('os')`, which Jest's `vm` sandbox rejects, and the driver swallows the
 * rejection so the symptom is a hang rather than an error (the trap
 * `apps/server/src/testing/mongo-test-context.ts` documents). A test supplies a `connect` that
 * passes `runtimeAdapters: {os}`, which is the driver's escape hatch; production uses the
 * default in `main.ts`, where Node resolves `os` normally.
 *
 * The dependencies are required rather than defaulted here, so this module has no `bcrypt` or
 * `mongoose.createConnection` wiring of its own and can be covered in full by the test harness.
 */
interface IRunDependencies {
  hashPassword: (plaintext: string) => Promise<string>;
  connect: (uri: string) => Promise<mongoose.Connection>;
}

/**
 * A tiny hand-rolled parser rather than a dependency: the tool takes three flags, and adding an
 * argument parser to a repository that has none for a one-off tool is not worth a dependency to
 * maintain. An unknown flag is an error so a typo (`--dryrun`) does not silently run a write.
 */
const parseArgs = (argv: string[]): ICli => {
  const flags = new Map<string, string | true>();
  const known = new Set(['source', 'target', 'dry-run']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [name, inline] = arg.slice(2).split('=');
    // The name is checked before the value is consumed, so `--dryrun` reports itself as unknown
    // rather than as a flag that needs a value — a typo of `--dry-run` is the case that matters,
    // and "needs a value" would send the operator looking in the wrong place.
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

  const source = flags.get('source');
  const target = flags.get('target');
  if (typeof source !== 'string' || typeof target !== 'string') {
    throw new Error('Usage: migration --source <dir> --target <mongodb-uri> [--dry-run]');
  }
  return {source, target, dryRun: flags.has('dry-run')};
};

/** The model for a collection, from the bound set. */
const modelFor = (models: IMigrationModels, collection: TCollection): IDbModel => {
  switch (collection) {
    case 'bookings':
      return models.Booking;
    case 'clients':
      return models.Client;
    case 'buildings':
      return models.Building;
    case 'users':
      return models.User;
  }
};

/**
 * Applies every write plan and fills in the per-collection counts.
 *
 * A single record's failure does not abort the run: it is counted and reported, so one bad
 * document is visible alongside the rest rather than stopping the migration at it. The exit
 * code is what turns "some failed" into a failed migration.
 */
const applyPlans = async (plans: IWritePlan[], models: IMigrationModels, report: IReconciliationReport): Promise<void> => {
  for (const plan of plans) {
    const model = modelFor(models, plan.collection);
    const {_id} = plan.document;
    const filter = {_id};
    const existed = (await model.exists(filter)) !== null;
    const {$set, $setOnInsert} = toUpdate(plan);
    try {
      await model.updateOne(filter, {$set, $setOnInsert}, {upsert: true});
      if (existed) {
        report.collections[plan.collection].updated += 1;
      } else {
        report.collections[plan.collection].inserted += 1;
      }
    } catch (error) {
      report.collections[plan.collection].failed += 1;
      console.error(`Failed to write ${plan.collection} ${plan.legacyId}: ${(error as Error).message}`);
    }
  }
};

/**
 * Runs the migration and returns the process exit code.
 *
 * The code is `0` only when every record validated, every write succeeded and every reference
 * resolved — the same condition the printed report summarises, so "it passed" and "the numbers
 * look right" cannot disagree.
 */
const run = async (cli: ICli, dependencies: IRunDependencies): Promise<number> => {
  const source: ILegacyExport = loadExport(cli.source);
  const report = emptyReport();
  for (const collection of COLLECTIONS) {
    report.collections[collection].read = source[collection].length;
  }
  report.references = countReferences(source);

  // Validation uses the default connection's models: it does not touch the database, so the
  // process-global registry is the right home for it, and it lets a dry run work with no server
  // reachable at all.
  const {plans, failures} = await planWrites(source, bindModels(mongoose.connection), dependencies.hashPassword);

  if (failures.length > 0) {
    console.error(`Validation failed for ${failures.length} record(s):`);
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
  }

  if (cli.dryRun) {
    // A dry run reports what a real run's insert path would write, so an operator can compare
    // the counts to the legacy figures before committing to the write.
    for (const plan of plans) {
      report.collections[plan.collection].inserted += 1;
    }
    console.log(formatReport(report, true));
    return failures.length === 0 && isClean(report) ? 0 : 1;
  }

  const connection = await dependencies.connect(cli.target);
  try {
    const models = bindModels(connection);
    await applyPlans(plans, models, report);
    // The indexes the API relies on are declared on the schemas; an import that skipped them
    // would leave the first queries on the migrated data as collection scans.
    await Promise.all(Object.values(models).map((model) => model.createIndexes()));
  } finally {
    await connection.close();
  }

  console.log(formatReport(report, false));
  return failures.length === 0 && isClean(report) ? 0 : 1;
};


export {parseArgs, run};
export type {ICli, IRunDependencies};
