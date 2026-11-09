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
  // The users schema, DTO, serialiser and service (T007) moved them to
  // 84/83/67/83. Every file under `users/` measures 100%, so the increase is real
  // coverage rather than boot coverage: the serialiser is asserted against a
  // password hash reaching it, and the update path is asserted to hand the driver
  // a bcrypt hash rather than the plaintext it used to store (CHK017).
  //
  // The auth module (T013) moved them to 85/86/69/84. The increase is real coverage
  // rather than boot coverage: the enumeration fix is asserted at both layers — the
  // service answers one message for all three rejection reasons, and the HTTP spec
  // asserts the unknown-e-mail and wrong-password responses are byte-identical, which
  // is what a message-only unit test cannot see.
  //
  // The public booking read path (T016) moved them to 85/87/70/85. Two files carry
  // the increase: the optional-auth guard, and the booking serialiser, which is
  // asserted field-by-field against a booking that has every personal field set.
  //
  // These are measured on the files Jest actually aggregates into `global`, which
  // is *not* every file. A more specific glob key takes its files out of the
  // `global` pool: `authorization` is at 100%, so excluding it lowers the figure.
  // Computed over all files the numbers are 87/87/71/86, which is what the report
  // prints as `total` — reading that as the global value sets the threshold four
  // points too high and the run fails on a report that says the threshold passed.
  // Derive the floor by summing the per-file rows that do not match the
  // `authorization` glob, not by reading `total`.
  //
  // `global` is no longer the only threshold group: `authorization` is the first
  // per-directory group, and it mechanises SC-008 for the one domain module that
  // exists today.
  //
  // SC-008 names four domain modules — bookings, conflicts, reports and
  // authorisation. Two exist: `authorization` and, since T018, `conflicts`. The
  // conflict rules are pure and fully exercised, so the group below mechanises the
  // 80% floor for that module. `reports` has no source at all (T026 is unbuilt).
  //
  // `bookings` is the fourth SC-008 module and gained its per-file group with T045.
  // The blocker the note above used to record is gone: `models/booking-query.dto.ts`
  // reached 100% branches once its spec drove the real `ValidationPipe` over every
  // `BooleanQuery` arm (including the explicit-`undefined` case class-transformer would
  // otherwise skip), and every file under `bookings/` now measures 100%. T045 also gave
  // `booked-time.schema.ts` its own spec — its `endHours` validator guards against a
  // non-`Date` value, and that arm is unreachable through parent validation because the
  // `type: Date` cast runs first, so it is driven by calling the validator directly.
  //
  // `users` is deliberately not a group even though it now measures 100%: SC-008
  // does not name it, and a group whose files are all at 100% would be a second
  // copy of the per-file rule rather than a mechanisation of the criterion. The
  // global ratchet is what carries the increase.
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
    // The conflict rules (T018) are the second SC-008 module. The file measures
    // 100% and 80 is the criterion's floor; the group exists so the algorithm cannot
    // gain a branch without a test. Both groups take their files out of `global`, so
    // the global figure is measured *without* them — re-derive it from the per-file
    // rows rather than reading the report's `total`.
    '**/src/app/bookings/conflicts/**/*.ts': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    // The reports module is the third SC-008 module, added with T026–T029. It is the summary
    // aggregation, the CSV column contract and the deny-list; like the two groups above it takes
    // its files out of `global`, so the global figure is measured *without* them — every file
    // here measures at least 97%, so the exclusion lowers the global number, and the global
    // floor below was re-derived from the per-file rows rather than read from the report's
    // `total`.
    '**/src/app/reporting/**/*.ts': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    // The bookings domain (T045). This is the fourth SC-008 module and the one the note
    // above deferred: every file under `bookings/` now measures 100%, so 80 is the
    // criterion's floor and a new file arriving without tests fails at 0% immediately.
    // The key is placed *after* `bookings/conflicts/` on purpose — Jest assigns a file to
    // the first matching key, so the narrower conflict group must win; were the order
    // reversed this group would swallow the conflict rules and that key would be dead.
    '**/src/app/bookings/**/*.ts': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    // Raised with the domain-coverage work (T045). The four per-file groups above take
    // their files out of this pool, so the figure here is the aggregate of everything
    // *except* `authorization/`, `bookings/conflicts/`, `reporting/` and `bookings/` —
    // 99.87/95.54/99.30/99.86 on this branch. Adding the `bookings/` group moved the pool
    // again: those files are all at 100%, so removing them lowers the aggregate, which is
    // why the floor was re-derived from the per-file rows rather than carried over. The
    // branches figure also moved because T045 added the unit specs that drive the
    // defensive arms a request cannot reach — the error filter's non-`Error` throw and
    // unusable response, the redactor's unserialisable structure, the request context read
    // outside a request. The floor is set just below the measured value rather than at it,
    // because the pool includes boot coverage from the integration specs, which can shift
    // by a statement when a test is added or reordered; the point is that it cannot fall
    // back.
    global: {
      statements: 99,
      branches: 95,
      functions: 99,
      lines: 99,
    },
  },
};
