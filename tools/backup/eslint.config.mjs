import baseConfig from '../../eslint.config.mjs';

/**
 * The backup / retention tool, with the same deliberate module-boundary exception as
 * `tools/migration` and `tools/bootstrap-admin`.
 *
 * `@nx/enforce-module-boundaries` forbids importing an app's code from anywhere (the
 * `noImportsOfApps` check runs before any tag constraint, so no tag can permit it). This tool
 * needs one thing from the server: the pinned `mongod` version (`@server/testing/mongo-version`),
 * so the round-trip spec starts the same server the server's own integration tests do rather
 * than resolving the latest supported version at install time. The exception is scoped to this
 * project's files rather than added to the root config, so the rule still forbids every other
 * project from reaching into an app.
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
