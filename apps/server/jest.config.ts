export default {
  displayName: 'server',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // class-validator/class-transformer rely on decorator metadata, which requires
  // reflect-metadata to be loaded before any module is imported.
  setupFiles: ['reflect-metadata'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/server',
  // `json-summary` is what the CI step reads to print the per-project table.
  coverageReporters: ['html', 'json-summary'],

  // Without this, Jest instruments only the modules an existing test happens to
  // import, so a source file with no tests is absent from the report AND from
  // the denominator. That made the same test run report 63.9% or 42.5%
  // depending only on configuration.
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '\\.spec\\.ts$',
    // NestJS wiring: declares which providers exist, has no behaviour of its
    // own. Exercised by the e2e harness (#10), which boots the real module.
    '\\.module\\.ts$',
    // Bootstrap. Testing it means mocking NestFactory and asserting on listen().
    '^src/main\\.ts$',
  ],

  // Set at the measured value so this is a ratchet: it cannot regress and is
  // raised as phases land. T045 raises the domain services to the 80% that
  // SC-008 requires.
  //
  // `global` is deliberately the only threshold group. Jest assigns each file
  // to the first matching path or glob group and only files matching NO group
  // fall through to `global`, so adding a per-directory group silently removes
  // those files from `global`. A `global: 49` with five service directories
  // listed would have been enforced against the 57.09% remainder, not the
  // 49.88% the report shows. Per-directory thresholds are added in T045, and
  // this number is re-derived from the report at that point.
  coverageThreshold: {
    global: {
      statements: 54,
      branches: 43,
      functions: 29,
      lines: 52,
    },
  },
};
