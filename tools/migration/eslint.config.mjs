import baseConfig from '../../eslint.config.mjs';

/**
 * The migration tool, with one deliberate exception to the module-boundary rule.
 *
 * `@nx/enforce-module-boundaries` forbids importing an app's code from anywhere (the
 * `noImportsOfApps` check runs before any tag constraint, so no tag can permit it). The
 * migration tool needs the server's **real** schema objects: it validates every transformed
 * legacy record against the same `SchemaFactory.createForClass(...)` the API uses, so a
 * transform that produced a value the server would reject fails at import time rather than
 * writing a document the API cannot read back. A second, hand-written copy of the schemas would
 * drift the moment either side changed, which is the single-source-of-truth principle this
 * exception serves.
 *
 * The exception is scoped to this project's files rather than added to the root config, so the
 * rule still forbids every other project from reaching into an app. `allow` matches the import
 * string, and `@server/**` (not `@server/*`, which matches only one path segment) is what covers
 * the nested schema paths. The aliases it names live in `tsconfig.base.json`; the two the tool
 * needed and that were missing there (`@server/buildings/*`, `@server/clients/*`) were added
 * alongside this.
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
