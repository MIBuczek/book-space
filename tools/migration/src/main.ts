import 'reflect-metadata';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import {parseArgs, run} from './lib/cli';

/**
 * The migration tool's entry point.
 *
 * Run:
 *
 *   nx run migration:run -- --source <dir> --target <mongodb-uri> [--dry-run]
 *
 * Everything of substance lives in `lib/cli.ts` so it can be driven by a test against an
 * ephemeral `mongod`; this file only reads the process arguments, calls `run`, and turns the
 * result into an exit code. The split is the same one `apps/server` uses between `main.ts` and
 * `config/configure-app.ts`, and for the same reason: the behaviour is testable without booting
 * the process.
 */
run(parseArgs(process.argv.slice(2)), {
  hashPassword: (plaintext) => bcrypt.hash(plaintext, 10),
  connect: (uri) => mongoose.createConnection(uri).asPromise(),
})
  .then((code) => process.exit(code))
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
