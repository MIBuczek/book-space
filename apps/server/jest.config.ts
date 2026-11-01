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
    //
    // Anchored on `/src/` rather than `^src/`: Jest tests these patterns against
    // each file's absolute path, so `^src/main\.ts$` matched nothing and this
    // file was counted at 0% while the comment claimed otherwise. The patterns
    // that already worked (`.module.ts$`, `.spec.ts$`) are unanchored, which is
    // why only the anchored one was silently dead.
    '/src/main\\.ts$',
    // Integration-test scaffolding, not production code: it exists to boot the
    // app under test. It is exercised by mongo-test-context.spec.ts, but counting
    // it here inflates the global figure — the two files are ~98% covered, so
    // adding them moved the reported total from 54.18% to 67.44% without a line
    // of production code changing. The ratchet is meant to measure production
    // code, so scaffolding is excluded for the same reason as the wiring above.
    '/src/testing/',
  ],

  // A ratchet: set to the measured value, never lowered, raised as phases land
  // (constitution, Principle III). T045 raises the domain services to the 80%
  // that SC-008 requires.
  //
  // The figures were 49/19/25/46 when the threshold was introduced (#106). They
  // move to 67/45/34/64 because two things changed the measurement, not the code:
  //
  // 1. The `/src/main.ts$` pattern above was dead, so `main.ts` sat in the
  //    denominator at 0%. Fixing the pattern is worth about 1.5 points.
  // 2. The integration harness (T006) boots the real `AppModule`, which executes
  //    every module, controller and schema body. That is execution, so it counts
  //    as coverage, and it is the bulk of the increase. It is boot coverage
  //    rather than assertions about those paths, so the number overstates how
  //    much behaviour is verified; the domain targets in T045 are what make this
  //    a meaningful figure, and until then it is a floor that cannot regress.
  //
  // `global` is deliberately the only threshold group. Jest assigns each file
  // to the first matching path or glob group and only files matching NO group
  // fall through to `global`, so adding a per-directory group silently removes
  // those files from `global`. Per-directory thresholds are added in T045, and
  // this number is re-derived from the report at that point.
  coverageThreshold: {
    global: {
      statements: 72,
      branches: 61,
      functions: 46,
      lines: 69,
    },
  },
};
