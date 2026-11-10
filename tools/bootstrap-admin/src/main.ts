import 'reflect-metadata';
import mongoose from 'mongoose';
import {parseArgs, run} from './lib/cli';

/**
 * The first-administrator bootstrap's entry point (FR-046, SC-009).
 *
 * Run:
 *
 *   nx run bootstrap-admin:run -- --target <mongodb-uri> --email <address>
 *
 * with `BOOTSTRAP_ADMIN_PASSWORD` set in the environment. Everything of substance lives in
 * `lib/cli.ts` so it can be driven by a test against an ephemeral `mongod`; this file only reads
 * the process arguments, calls `run`, and turns the result into an exit code — the same split
 * `tools/migration/src/main.ts` and `apps/server/src/main.ts` use, and for the same reason: the
 * behaviour is testable without booting the process.
 */
run(parseArgs(process.argv.slice(2), process.env), {
  connect: (uri) => mongoose.createConnection(uri).asPromise(),
})
  .then((code) => process.exit(code))
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
