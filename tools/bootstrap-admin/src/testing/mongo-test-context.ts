import * as os from 'os';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MONGO_MEMORY_SERVER_VERSION} from '@server/testing/mongo-version';

/**
 * Ephemeral MongoDB for the bootstrap tool's integration test.
 *
 * The tool's whole job is to write a user document the API can sign in against, so the test that
 * proves it must write to a real `mongod` and read with the real `User` schema — a stub would
 * prove nothing about the thing being created. CI has no MongoDB service, so this starts one.
 *
 * The two details inherited from `apps/server/src/testing/mongo-test-context.ts` are handled the
 * same way: the driver's dynamic `import('os')` is rejected by Jest's `vm` sandbox, so
 * `runtimeAdapters: {os}` is passed, and the `mongod` version is pinned so the same commit is
 * tested against the same server everywhere.
 */
interface IBootstrapTestContext {
  uri: string;
  connection: mongoose.Connection;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const TEST_DB_NAME = 'book_space_bootstrap';

const createBootstrapTestContext = async (): Promise<IBootstrapTestContext> => {
  const mongo = await MongoMemoryServer.create({binary: {version: MONGO_MEMORY_SERVER_VERSION}});
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

export {createBootstrapTestContext};
export type {IBootstrapTestContext};
