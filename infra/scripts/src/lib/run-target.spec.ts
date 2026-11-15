import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

/**
 * A regression guard for the `run` targets' `@server/*` alias resolution.
 *
 * The four tools (`migration`, `backup`, `bootstrap-admin`, `ensure-collections`) import the
 * server's real schemas through the `@server/*` aliases declared in `tsconfig.base.json`. Those
 * aliases are a **TypeScript** feature: `ts-node` compiles the `import` but leaves the
 * specifier alone, so at run time Node sees `require('@server/…')` and, with nothing to map it,
 * fails with `Cannot find module '@server/…'`. The tools therefore run under
 * `ts-node -r tsconfig-paths/register`, and `tsconfig-paths` reads the `tsconfig.json` that
 * `ts-node`'s `--project` selects (it inherits `TS_NODE_PROJECT`).
 *
 * The failure mode this guards is silent in the obvious test: `nx test` runs through `ts-jest`,
 * whose own `moduleNameMapper` resolves the aliases, so the *unit suite passes* while `nx run
 * migration:run` is broken. That is exactly how the bug shipped — `tools/migration`'s run
 * target was missing the register flag and no spec noticed, because every spec imports the
 * schemas through a path Jest rewrites.
 *
 * So this spec does two things a unit test cannot:
 *
 * 1. It reads each `project.json` and asserts the `run` command carries `-r tsconfig-paths/register`.
 *    That is the cheap check, and it fails the moment someone rewrites a command without it.
 * 2. It proves the flag is **load-bearing** by spawning `ts-node` twice against a fixture that
 *    imports an `@server/*` alias: once with the register flag (must resolve) and once without
 *    (must fail). If a future `ts-node`/Node resolved the aliases on its own, the second spawn
 *    would start succeeding and this half would fail — which is the point, because then the flag
 *    could be removed deliberately rather than kept on faith.
 *
 * The fixture is written to a temp file inside the repository (not `/tmp`) so Node's resolution
 * and `tsconfig-paths`' root walk-up behave the same as they do for the real tools.
 */

const workspaceRoot = resolve(__dirname, '../../../..');

/** The four tools whose run target must resolve the `@server/*` aliases. */
const tools = ['infra/scripts', 'tools/migration', 'tools/backup', 'tools/bootstrap-admin'];

interface IProjectJson {
  targets?: {run?: {options?: {command?: string}}};
}

const runCommandFor = (tool: string): string => {
  const path = join(workspaceRoot, tool, 'project.json');
  const project = JSON.parse(readFileSync(path, 'utf8')) as IProjectJson;
  const command = project.targets?.run?.options?.command;
  if (command === undefined) {
    throw new Error(`${tool}/project.json has no run target command`);
  }
  return command;
};

/** Runs `ts-node` on a fixture and returns whether it exited 0. */
const tsNodeSucceeds = (project: string, fixture: string, registerPaths: boolean): boolean => {
  const args = ['--transpile-only'];
  if (registerPaths) {
    args.push('-r', 'tsconfig-paths/register');
  }
  args.push('--project', join(workspaceRoot, project, 'tsconfig.json'), fixture);
  try {
    execFileSync(join(workspaceRoot, 'node_modules/.bin/ts-node'), args, {
      cwd: workspaceRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
};

describe('tool run targets resolve the @server/* aliases', () => {
  let fixtureDir: string;
  let fixture: string;

  beforeAll(() => {
    // A repo-local temp directory: `tsconfig-paths` resolves the tsconfig relative to the
    // working directory and the fixture must be inside the workspace for the alias to be the
    // thing under test rather than the file's location.
    fixtureDir = mkdtempSync(join(workspaceRoot, '.alias-fixture-'));
    fixture = join(fixtureDir, 'fixture.ts');
    writeFileSync(
      fixture,
      "import {MONGO_MEMORY_SERVER_VERSION} from '@server/testing/mongo-version';\n" +
        'console.log(MONGO_MEMORY_SERVER_VERSION);\n',
    );
  });

  afterAll(() => {
    rmSync(fixtureDir, {recursive: true, force: true});
  });

  it.each(tools)('%s:run passes -r tsconfig-paths/register', (tool) => {
    expect(runCommandFor(tool)).toContain('-r tsconfig-paths/register');
  });

  it('the register flag is what makes an @server/* import resolve', () => {
    // With the flag: the alias resolves and the fixture runs.
    expect(tsNodeSucceeds('infra/scripts', fixture, true)).toBe(true);
    // Without it: the same fixture fails, which is the bug the flag exists to prevent. If this
    // ever flips to `true`, the alias is resolving by itself and the flag can be reconsidered.
    expect(tsNodeSucceeds('infra/scripts', fixture, false)).toBe(false);
  });
});
