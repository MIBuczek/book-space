import {promises as fs} from 'node:fs';
import * as path from 'node:path';
import mongoose from 'mongoose';
import {EJSON} from 'bson';

/**
 * The backup archive format and the dump/restore routines (T060, NFR-001).
 *
 * An archive is a directory holding one Extended JSON file per collection plus a
 * `manifest.json` that records what was written. Extended JSON is the format because it is
 * lossless for exactly the types a `JSON.stringify` would mangle — `ObjectId`, `Date`,
 * `Decimal128` — and reading it back with the matching `EJSON.parse` reconstructs the original
 * BSON value rather than a string that only looks like one. A plain-JSON dump would silently
 * turn every `_id` into a hex string and every `Date` into an ISO string, and the restore would
 * write documents the API cannot query by `_id`.
 *
 * The routines take a `mongoose.Connection` and an injected file-system seam, so a test drives
 * the whole dump/restore round trip against an ephemeral `mongod` and a temporary directory
 * rather than mocking the database — a backup whose restore has only been mocked has not been
 * tested.
 */

/** The collections a backup covers. `bookedTimes` is embedded in `bookings`, so it is not one. */
const BACKUP_COLLECTIONS = ['users', 'clients', 'buildings', 'bookings'] as const;
type TBackupCollection = (typeof BACKUP_COLLECTIONS)[number];

/** The minimal file-system surface the tool uses, so a test can supply a temporary directory. */
interface IArchiveFs {
  mkdir(dir: string): Promise<void>;
  writeFile(file: string, data: string): Promise<void>;
  readFile(file: string): Promise<string>;
}

const nodeArchiveFs: IArchiveFs = {
  mkdir: async (dir) => {
    await fs.mkdir(dir, {recursive: true});
  },
  writeFile: (file, data) => fs.writeFile(file, data, 'utf8'),
  readFile: (file) => fs.readFile(file, 'utf8'),
};

/** What a `manifest.json` records about an archive, so a restore can reconcile against it. */
interface IArchiveManifest {
  /** ISO timestamp the dump was taken. */
  createdAt: string;
  /** The database the documents were read from, for the operator's record. */
  sourceDatabase: string;
  /** Document count per collection, the reconciliation baseline SC-003 compares against. */
  counts: Record<TBackupCollection, number>;
}

const manifestPath = (dir: string): string => path.join(dir, 'manifest.json');
const collectionPath = (dir: string, collection: TBackupCollection): string =>
  path.join(dir, `${collection}.json`);

/**
 * The connection's database handle, or a thrown error naming what is missing.
 *
 * Every routine needs the handle and none of them can proceed without it, so the guard lives in
 * one place: a `createConnection()` that was never opened (or a URI with no database) has no
 * `.db`, and dereferencing `undefined` would surface as "Cannot read properties of undefined"
 * rather than a message an operator can act on.
 */
const requireDatabase = (connection: mongoose.Connection): mongoose.mongo.Db => {
  if (!connection.db) {
    throw new Error('The connection has no database handle');
  }
  return connection.db;
};

/**
 * Writes a full archive of the four collections to `dir`.
 *
 * Every collection is read with an unbounded `find({})` on purpose: a backup that applied the
 * application's paging or a soft-delete filter would silently omit the records those filters
 * hide — a retired facility or an archived booking is exactly what a restore needs. The
 * unbounded read is safe here because it is an operator-run tool against their own database,
 * not a request path.
 */
const dumpDatabase = async (
  connection: mongoose.Connection,
  dir: string,
  fsImpl: IArchiveFs = nodeArchiveFs
): Promise<IArchiveManifest> => {
  const db = requireDatabase(connection);
  await fsImpl.mkdir(dir);

  const counts = {} as Record<TBackupCollection, number>;
  for (const collection of BACKUP_COLLECTIONS) {
    const documents = await db.collection(collection).find({}).toArray();
    counts[collection] = documents.length;
    // `relaxed: false` is the canonical form: dates and ids are typed rather than relying on
    // the reader to guess, which is what makes the archive a faithful copy.
    await fsImpl.writeFile(collectionPath(dir, collection), EJSON.stringify(documents, {relaxed: false}));
  }

  const manifest: IArchiveManifest = {
    createdAt: new Date().toISOString(),
    sourceDatabase: db.databaseName,
    counts,
  };
  await fsImpl.writeFile(manifestPath(dir), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};

/** Reads an archive's manifest. */
const readManifest = async (dir: string, fsImpl: IArchiveFs = nodeArchiveFs): Promise<IArchiveManifest> =>
  JSON.parse(await fsImpl.readFile(manifestPath(dir))) as IArchiveManifest;

/**
 * Restores an archive into the connection's database.
 *
 * The collections are replaced rather than merged: the restore is the counterpart of a
 * point-in-time dump, so a leftover document from a previous state would be a record the archive
 * does not contain — a silent difference between the backup and what the database holds. The
 * delete runs first, and the inserts use `ordered: false` so one bad document does not abort the
 * remaining ones; the caller reconciles the written counts against the manifest and fails on any
 * shortfall.
 *
 * This is meant to run against a **scratch** database (the runbook's restore rehearsal), which
 * is why it does not ask the operator to confirm — the destructive target is one they named on
 * the command line, and the verification step is what proves it worked.
 */
const restoreDatabase = async (
  connection: mongoose.Connection,
  dir: string,
  fsImpl: IArchiveFs = nodeArchiveFs
): Promise<IArchiveManifest> => {
  const db = requireDatabase(connection);
  const manifest = await readManifest(dir, fsImpl);

  const written = {} as Record<TBackupCollection, number>;
  for (const collection of BACKUP_COLLECTIONS) {
    const raw = await fsImpl.readFile(collectionPath(dir, collection));
    const documents = EJSON.parse(raw, {relaxed: false}) as Record<string, unknown>[];
    const target = db.collection(collection);
    await target.deleteMany({});
    if (documents.length > 0) {
      await target.insertMany(documents, {ordered: false});
    }
    written[collection] = documents.length;
  }

  return {...manifest, counts: written};
};

export {dumpDatabase, restoreDatabase, readManifest, requireDatabase, nodeArchiveFs, BACKUP_COLLECTIONS};
export type {IArchiveManifest, IArchiveFs, TBackupCollection};
