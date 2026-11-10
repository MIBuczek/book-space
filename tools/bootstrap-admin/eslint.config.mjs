import baseConfig from '../../eslint.config.mjs';

/**
 * The first-administrator bootstrap tool, with one deliberate exception to the module-boundary
 * rule.
 *
 * `@nx/enforce-module-boundaries` forbids importing an app's code from anywhere (the
 * `noImportsOfApps` check runs before any tag constraint, so no tag can permit it). This tool
 * needs the server's **real** `User` schema and its password-hashing behaviour: it writes a
 * document the API must be able to sign in against, so a second, hand-written copy of the schema
 * would drift the moment either side changed — the single-source-of-truth principle this
 * exception serves. It is the same exception, for the same reason, as `tools/migration`.
 *
 * The exception is scoped to this project's files rather than added to the root config, so the
 * rule still forbids every other project from reaching into an app.
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
