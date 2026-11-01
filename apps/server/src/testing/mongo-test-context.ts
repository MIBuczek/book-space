import {INestApplication} from '@nestjs/common';
import {MongoMemoryServer} from 'mongodb-memory-server';
import * as os from 'os';
import {MONGO_MEMORY_SERVER_VERSION} from './mongo-version';

/**
 * Ephemeral MongoDB for API integration tests.
 *
 * CI has no MongoDB service, so anything that boots `AppModule` would otherwise
 * fail on connect. `mongodb-memory-server` starts a real `mongod` on a random
 * port, which keeps the tests honest: the schemas, indexes and validation the
 * production code relies on are exercised for real rather than mocked.
 *
 * Two details make this work, and both are easy to get wrong:
 *
 * 1. `AppModule` reads `process.env.DB_URI` while its decorator arguments are
 *    evaluated — that is, when the module file is first imported. The import is
 *    therefore deferred until after the server has started and the URI is known.
 *    A top-level `import {AppModule}` would capture an undefined URI.
 *
 * 2. The MongoDB 7.x driver resolves its `os` adapter with a dynamic
 *    `import('os')`. Jest's `vm`-based `node` environment rejects that with
 *    "A dynamic import callback was invoked without --experimental-vm-modules".
 *    The driver treats the rejection as non-fatal, so the client metadata ships
 *    without its `driver` sub-document and `mongod` answers "Missing required
 *    sub-document 'driver' in the client metadata document". Because
 *    `MongooseModule` retries nine times with a three second delay, the symptom
 *    is a ~27 second hang rather than an error. Passing `runtimeAdapters`
 *    supplies the adapter directly and skips the dynamic import; it is the
 *    escape hatch the driver provides for sandboxes with a restricted `require`.
 *    This is test-only: production Node resolves `os` normally.
 */
export interface MongoTestContext {
  app: INestApplication;
  uri: string;
  baseUrl: string;
  /** Drops the application database. Call between tests so they cannot leak into each other. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const TEST_DB_NAME = 'book_space';
const TEST_JWT_SECRET = 'integration-test-secret-value-32-chars-min';

export async function createMongoTestContext(): Promise<MongoTestContext> {
  const mongo = await MongoMemoryServer.create({
    binary: {version: MONGO_MEMORY_SERVER_VERSION},
  });
  const uri = mongo.getUri();

  process.env.DB_URI = uri;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? TEST_JWT_SECRET;

  const [{Test}, {AppModule}, {getConnectionToken}, {configureApp}] = await Promise.all([
    import('@nestjs/testing'),
    import('../app/app.module'),
    import('@nestjs/mongoose'),
    import('../app/config/configure-app'),
  ]);

  const mongoose = (await import('mongoose')).default;
  const connection = await mongoose
    .createConnection(uri, {dbName: TEST_DB_NAME, runtimeAdapters: {os}})
    .asPromise();

  const moduleRef = await Test.createTestingModule({imports: [AppModule]})
    // Replaces the connection `MongooseModule.forRoot` would open. The factory is
    // swapped rather than the URL, because the URL alone cannot carry the
    // `runtimeAdapters` option that point 2 above requires.
    .overrideProvider(getConnectionToken())
    .useValue(connection)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  // The same configuration `main.ts` applies. Without this the tests would
  // exercise an app that lacks the global pipe and filter, and would pass even
  // if `main.ts` stopped registering them.
  configureApp(app);
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') {
    throw new Error('The Nest application is not listening on a TCP port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  const reset = async () => {
    const {MongoClient} = await import('mongodb');
    const client = new MongoClient(uri, {runtimeAdapters: {os}});
    await client.connect();
    // The database must be named explicitly. The URI from `getUri()` carries no
    // database, so `client.db()` would resolve to `test` and drop the wrong one
    // while leaving the application's data untouched — isolation that silently
    // does nothing.
    await client.db(TEST_DB_NAME).dropDatabase();
    await client.close();
  };

  const close = async () => {
    await app.close();
    await connection.close();
    await mongo.stop();
  };

  return {app, uri, baseUrl, reset, close};
}
