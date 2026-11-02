export default {
  displayName: 'server',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // class-validator/class-transformer rely on decorator metadata, which requires
  // reflect-metadata to be loaded before any module is imported.
  setupFiles: ['reflect-metadata'],
  // Integration tests boot `AppModule` and start a real `mongod`, which takes
  // longer than Jest's 5s default on a cold CI runner. The default does not
  // report a slow hook as slow: the hook times out, its assignment never runs,
  // and the suite fails later on `undefined` in teardown, which reads like a
  // different bug. Set once here so a new integration spec cannot forget it.
  testTimeout: 120_000,
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
  // moved to 67/45/34/64 because two things changed the measurement, not the code:
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
  // They moved again to 73/66/53/71 with structured logging (T004), which adds
  // real assertions on the middleware, the interceptor, the logger and redaction
  // rather than boot coverage. As above, the numbers are the measured floor on
  // this branch, re-derived from the report, not a target.
  //
  // The authorisation primitives (T014/T017) moved them to 78/73/55/76. The
  // number *fell* from 81/79/60/80 measured with everything in one pool because
  // the `authorization` group below now takes its files out of `global` — those
  // files are at 100%, so removing them lowers the global figure. That is the
  // behaviour the paragraph above warns about, and it is why the global number had
  // to be re-derived rather than left alone.
  //
  // `global` is no longer the only threshold group: `authorization` is the first
  // per-directory group, and it mechanises SC-008 for the one domain module that
  // exists today.
  //
  // SC-008 names four domain modules — bookings, conflicts, reports and
  // authorisation. Only `authorization` exists: conflicts and reports have no
  // source at all (T018/T019/T026 are unbuilt), and `bookings` is at ~68%
  // statements, below the 80% the criterion requires. So this group covers the one
  // module that can meet the target today, and a `bookings`/`conflicts`/`reports`
  // group is added as each of those tasks lands. Setting a group for a module that
  // cannot reach 80% would fail the build for a reason unrelated to the change
  // that introduced it.
  coverageThreshold: {
    // The SC-008 floor. Jest applies a glob threshold to each matching file
    // individually, not to the directory as a whole, so this reads "every file
    // under `authorization/` is at least 80% covered" — verified by removing a
    // spec and watching the run fail on the specific file it left uncovered.
    // Every file currently measures 100%, so 80 is the criterion's requirement
    // rather than the measured value; the headroom is deliberate, and it also
    // means a new file arriving with no tests fails immediately at 0%, which is
    // the desired behaviour for a domain module.
    '**/src/app/authorization/**/*.ts': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    global: {
      statements: 78,
      branches: 73,
      functions: 55,
      lines: 76,
    },
  },
};
