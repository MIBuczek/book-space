import * as os from 'os';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MONGO_MEMORY_SERVER_VERSION} from '@server/testing/mongo-version';

/**
 * Ephemeral MongoDB for the backup tool's round-trip tests.
 *
 * The tool's whole job is to copy documents between two real databases, so the test that proves
 * it must move them between two real `mongod`s — a stub would prove nothing about the thing being
 * backed up. CI has no MongoDB service, so this starts one, the same way
 * `tools/migration/src/testing/mongo-test-context.ts` and
 * `apps/server/src/testing/mongo-test-context.ts` do.
 *
 * The MongoDB driver resolves its `os` adapter with a dynamic `import('os')`, which Jest's `vm`
 * sandbox rejects; the driver swallows the rejection and the handshake then hangs rather than
 * erroring. `runtimeAdapters: {os}` is the driver's escape hatch and is test-only. The `mongod`
 * version is pinned (imported from the server) so the same commit is tested against the same
 * server everywhere.
 */
interface IBackupTestContext {
  /** A URI for a "source" database. */
  sourceUri: string;
  /** A URI for a "target" database, distinct from the source. */
  targetUri: string;
  source: mongoose.Connection;
  target: mongoose.Connection;
  close: () => Promise<void>;
}

const SOURCE_DB_NAME = 'book_space_backup_source';
const TARGET_DB_NAME = 'book_space_backup_target';

const createBackupTestContext = async (): Promise<IBackupTestContext> => {
  const mongo = await MongoMemoryServer.create({binary: {version: MONGO_MEMORY_SERVER_VERSION}});
  const sourceUri = mongo.getUri(SOURCE_DB_NAME);
  const targetUri = mongo.getUri(TARGET_DB_NAME);

  const source = await mongoose
    .createConnection(sourceUri, {dbName: SOURCE_DB_NAME, runtimeAdapters: {os}})
    .asPromise();
  const target = await mongoose
    .createConnection(targetUri, {dbName: TARGET_DB_NAME, runtimeAdapters: {os}})
    .asPromise();

  const close = async () => {
    await source.close();
    await target.close();
    await mongo.stop();
  };

  return {sourceUri, targetUri, source, target, close};
};

export {createBackupTestContext};
export type {IBackupTestContext};
