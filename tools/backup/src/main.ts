import mongoose from 'mongoose';
import {parseArgs, run} from './lib/cli';

/**
 * The backup / restore / retention tool's entry point (T060).
 *
 * Run:
 *
 *   nx run backup:run -- backup  --source <uri> --out <dir>
 *   nx run backup:run -- restore --target <uri> --from <dir>
 *   nx run backup:run -- verify-restore --source <uri> --target <uri>
 *   nx run backup:run -- purge --target <uri> [--retention-years N] [--dry-run] [--export <dir>]
 *
 * Everything of substance lives in `lib/cli.ts` so a test can drive a run against an ephemeral
 * `mongod`; this file only parses the process arguments, calls `run`, and turns the result into
 * an exit code — the same split `tools/migration/src/main.ts` and
 * `tools/bootstrap-admin/src/main.ts` use.
 */
run(parseArgs(process.argv.slice(2)), {
  connect: (uri) => mongoose.createConnection(uri).asPromise(),
})
  .then((code) => process.exit(code))
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
