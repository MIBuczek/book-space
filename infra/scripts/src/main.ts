import {parseArgs, run} from './lib/cli';
import {openConnection} from './lib/models';

/**
 * `ensure-collections` (003 T116).
 *
 * Run:
 *
 *   nx run ensure-collections:run -- --target <mongodb-uri> [--dry-run]
 *
 * Everything of substance lives in `lib/cli.ts` so a test can drive a run against an ephemeral
 * `mongod`; this file only reads the process arguments, calls `run`, and turns the result into an
 * exit code — the same split `tools/migration/src/main.ts` and `tools/backup/src/main.ts` use.
 *
 * `openConnection` (not `mongoose.createConnection`) is what turns Mongoose's implicit
 * `autoCreate`/`autoIndex` off, so a `--dry-run` does not write.
 */
run(parseArgs(process.argv.slice(2)), {
  connect: (uri) => openConnection(uri, {}),
})
  .then((code) => process.exit(code))
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
