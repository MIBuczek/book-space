import * as os from 'os';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MONGO_MEMORY_SERVER_VERSION} from '@server/testing/mongo-version';

/**
 * Ephemeral MongoDB for the migration's round-trip test.
 *
 * The migration's whole job is to write documents the API can read back, so the test that
 * proves it must write to a real `mongod` and read with the real schemas — a stub would prove
 * nothing about the thing being migrated. CI has no MongoDB service, so this starts one.
 *
 * Two details, both inherited from `apps/server/src/testing/mongo-test-context.ts`, are easy to
 * get wrong and are handled here the same way:
 *
 * 1. The MongoDB driver resolves its `os` adapter with a dynamic `import('os')`, which Jest's
 *    `vm` sandbox rejects. The driver swallows the rejection, so client metadata ships without
 *    its `driver` sub-document and `mongod` refuses the handshake — a hang, not an error.
 *    `runtimeAdapters: {os}` is the driver's escape hatch and is test-only.
 * 2. The `mongod` version is pinned (imported from the server's `mongo-version.ts`) so the same
 *    commit is tested against the same server everywhere and CI's binary cache key is stable.
 */
interface IMigrationTestContext {
  uri: string;
  connection: mongoose.Connection;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const TEST_DB_NAME = 'book_space_migration';

const createMigrationTestContext = async (): Promise<IMigrationTestContext> => {
  const mongo = await MongoMemoryServer.create({binary: {version: MONGO_MEMORY_SERVER_VERSION}});
  // The database name is part of the URI the spec passes to `run`, so the migration writes to
  // the same database the assertions read. Without it `getUri()` yields a URI with no database
  // and both sides silently use `test` and `book_space_migration` respectively — the writes
  // succeed and the assertions find nothing.
  const uri = mongo.getUri(TEST_DB_NAME);

  const connection = await mongoose
    .createConnection(uri, {dbName: TEST_DB_NAME, runtimeAdapters: {os}})
    .asPromise();

  const reset = async () => {
    if (!connection.db) {
      throw new Error('The test connection has no database handle');
    }
    await connection.db.dropDatabase();
  };

  const close = async () => {
    await connection.close();
    await mongo.stop();
  };

  return {uri, connection, reset, close};
};

export {createMigrationTestContext};
export type {IMigrationTestContext};
