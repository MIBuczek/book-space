import {
  AdministratorExistsError,
  bootstrapAdministrator,
  MissingFieldError,
} from './bootstrap';
import type {IAdministrator, IBootstrapDependencies} from './bootstrap';

/**
 * The first-administrator bootstrap's argument parsing and run (FR-046, SC-009).
 *
 * Run:
 *
 *   nx run bootstrap-admin:run -- --target <mongodb-uri> \
 *     --email <address> --password <value> [--first-name <name>] [--last-name <name>]
 *
 * The password may instead come from `BOOTSTRAP_ADMIN_PASSWORD`, so it need not appear in the
 * shell history or a process listing — the same reason the migration tool takes its target on a
 * flag rather than a config file. A `--password` on the command line is still accepted for a
 * one-off local run, but the environment variable is the documented path.
 *
 * Everything of substance lives in `bootstrap.ts` so it can be driven by a test against an
 * ephemeral `mongod`; this module only parses the arguments and turns the result into an exit
 * code, the same split `tools/migration` uses.
 */

interface ICli {
  target: string;
  administrator: IAdministrator;
}

const USAGE =
  'Usage: bootstrap-admin --target <mongodb-uri> --email <address> ' +
  '[--password <value>] [--first-name <name>] [--last-name <name>]';

const KNOWN_FLAGS = new Set(['target', 'email', 'password', 'first-name', 'last-name']);

/**
 * A tiny hand-rolled parser rather than a dependency: the tool takes five flags, and the
 * migration tool already established the pattern. An unknown flag is an error so a typo does not
 * silently fall back to an environment variable or a default.
 */
const parseArgs = (argv: string[], env: Record<string, string | undefined>): ICli => {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [name, inline] = arg.slice(2).split('=');
    if (!KNOWN_FLAGS.has(name)) {
      throw new Error(`Unknown flag --${name}. ${USAGE}`);
    }
    if (inline !== undefined) {
      flags.set(name, inline);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`--${name} needs a value. ${USAGE}`);
    }
    flags.set(name, next);
    index += 1;
  }

  const target = flags.get('target');
  if (target === undefined) {
    throw new Error(USAGE);
  }

  // The password falls back to the environment so it can stay out of the shell history.
  const password = flags.get('password') ?? env['BOOTSTRAP_ADMIN_PASSWORD'];

  return {
    target,
    administrator: {
      email: flags.get('email') ?? '',
      password: password ?? '',
      firstName: flags.get('first-name') ?? 'Administrator',
      lastName: flags.get('last-name') ?? 'SISK',
    },
  };
};

/**
 * Runs the bootstrap and returns the process exit code.
 *
 * `0` means an administrator now exists — either because this run created one or because one was
 * already present, which the tool reports as a refusal rather than an error so a re-run in a
 * deployment script does not fail the pipeline. Every other outcome is `1`, so a caller can
 * branch on the code without parsing the log.
 */
const run = async (cli: ICli, dependencies: IBootstrapDependencies): Promise<number> => {
  try {
    const {email} = await bootstrapAdministrator(cli.target, cli.administrator, dependencies);
    console.log(`Created the first administrator: ${email}`);
    return 0;
  } catch (error) {
    if (error instanceof AdministratorExistsError) {
      console.log(error.message);
      return 0;
    }
    if (error instanceof MissingFieldError) {
      console.error(error.message);
      return 1;
    }
    console.error((error as Error).message);
    return 1;
  }
};

export {parseArgs, run, USAGE};
export type {ICli};
export type {IBootstrapDependencies};
