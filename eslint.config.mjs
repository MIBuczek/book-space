import {FlatCompat} from '@eslint/eslintrc';
import {dirname} from 'path';
import {fileURLToPath} from 'url';
import js from '@eslint/js';
import nx from '@nx/eslint-plugin';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended
});

export default [
  {
    // The legacy root .eslintrc.json set `ignorePatterns: ["**/*"]` so the root config
    // matched nothing and every project was linted through its own config. Flat config has
    // no equivalent, so the same effect is spelled out as ignores.
    ignores: ['dist/**', 'coverage/**', '.angular/**', '**/node_modules/**', 'tmp/**']
  },
  ...nx.configs['flat/base'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*']
            }
          ]
        }
      ]
    }
  },
  {
    // Validation is global (see specs/001-booking-platform-rewrite/backend-conventions.md).
    // A per-parameter `new ValidationPipe()` in a controller silently drops the
    // `whitelist`/`forbidNonWhitelisted` options, which reopens the mass-assignment
    // surface the global pipe closes — and it is invisible in review because the
    // controller still looks validated. The global pipe is the only permitted one.
    files: ['apps/server/src/**/*.controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='ValidationPipe']",
          message:
            'Do not construct ValidationPipe in a controller; it bypasses the global pipe. Configure it in configure-app.ts instead.'
        }
      ]
    }
  },
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...compat
    .config({
      env: {
        jest: true
      }
    })
    .map((config) => ({
      ...config,
      files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js', '**/*.spec.jsx'],
      rules: {
        ...config.rules
      }
    }))
];
