import * as os from 'os';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MONGO_MEMORY_SERVER_VERSION} from '@server/testing/mongo-version';
import {openConnection} from '../lib/models';

/**
 * Ephemeral MongoDB for the `ensure-collections` idempotence tests (003 T117).
 *
 * The tool's job is to create collections and indexes on a real server, so the test that proves
 * it must run against a real `mongod` — a stub would prove nothing about the index keys the
 * server actually builds. CI has no MongoDB service, so this starts one, the same way
 * `apps/server/src/testing/mongo-test-context.ts` and `tools/migration`'s harness do.
 *
 * The MongoDB driver resolves its `os` adapter with a dynamic `import('os')`, which Jest's `vm`
 * sandbox rejects; the driver swallows the rejection and the handshake then hangs rather than
 * erroring. `runtimeAdapters: {os}` is the driver's escape hatch and is test-only. The `mongod`
 * version is pinned (imported from the server) so the same commit is tested against the same
 * server everywhere.
 */
interface IEnsureTestContext {
  uri: string;
  connection: mongoose.Connection;
  /** Drops the database so a test starts from an empty server. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const DB_NAME = 'book_space_ensure_collections';

const createEnsureTestContext = async (): Promise<IEnsureTestContext> => {
  const mongo = await MongoMemoryServer.create({binary: {version: MONGO_MEMORY_SERVER_VERSION}});
  const uri = mongo.getUri(DB_NAME);
  const connection = await openConnection(uri, {dbName: DB_NAME, runtimeAdapters: {os}});

  const reset = async () => {
    if (connection.db !== undefined) {
      await connection.db.dropDatabase();
    }
  };

  const close = async () => {
    await connection.close();
    await mongo.stop();
  };

  return {uri, connection, reset, close};
};

export {createEnsureTestContext};
export type {IEnsureTestContext};
