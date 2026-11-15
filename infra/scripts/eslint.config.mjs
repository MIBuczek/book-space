import baseConfig from '../../eslint.config.mjs';

/**
 * The `ensure-collections` deployment tool, with the same deliberate module-boundary exception
 * as `tools/migration`, `tools/bootstrap-admin` and `tools/backup`.
 *
 * `@nx/enforce-module-boundaries` forbids importing an app's code from anywhere (the
 * `noImportsOfApps` check runs before any tag constraint, so no tag can permit it). This tool
 * needs the server's **real** schemas: it creates the collections and the indexes the API relies
 * on by binding `SchemaFactory.createForClass(...)` and calling `createIndexes()`, so the
 * deployment cannot create a different set of indexes from the one the API assumes. A
 * hand-written copy of the index list would drift the moment either side changed — the drift the
 * single-source principle forbids. The exception is scoped to this project's files rather than
 * added to the root config, so the rule still forbids every other project from reaching into an
 * app.
 */
export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['@server/**'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
];
