export default {
  displayName: 'ui',
  preset: '../../jest.preset.js',
  // Angular components need a DOM; the nx preset defaults to node.
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/ui',
  // `json-summary` is what the CI step reads to print the per-project table.
  coverageReporters: ['html', 'json-summary'],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],

  // As on the server: without this, only the modules a test imports are
  // instrumented, so an untested file is absent from the report and from the
  // denominator.
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: [
    // Bootstrap. Testing it means mocking bootstrapApplication and asserting on
    // the catch.
    '/main\\.ts$',
    // Provider wiring, the Angular equivalent of a NestJS module: it declares
    // which providers exist and has no behaviour of its own.
    '/app\\.config\\.ts$',
  ],

  // Measured at introduction and never lowered. This is high because the UI is
  // currently four scaffold files; it will fall as real components land, and the
  // ratchet then requires them to arrive covered rather than lowering the bar.
  coverageThreshold: {
    global: {
      statements: 92,
      branches: 100,
      functions: 100,
      lines: 91,
    },
  },
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
