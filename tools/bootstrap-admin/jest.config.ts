export default {
  displayName: 'bootstrap-admin',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // class-validator/class-transformer rely on decorator metadata, which requires
  // reflect-metadata to be loaded before any module is imported.
  setupFiles: ['reflect-metadata'],
  // The integration spec starts a real `mongod`, which takes longer than Jest's 5s
  // default on a cold CI runner (the same reason `apps/server` raises it).
  testTimeout: 120_000,
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.spec.json'}],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/tools/bootstrap-admin',
  coverageReporters: ['html', 'json-summary'],
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '\\.spec\\.ts$',
    // The CLI bootstrap: it reads `process.argv`, calls `run` and sets an exit code. The
    // behaviour lives in `run`/`parseArgs`, which are covered.
    '/src/main\\.ts$',
    // The test harness exists to start `mongod`, not to be shipped.
    '/src/testing/',
  ],
  // The constitution requires 100% on files added or modified, and this project is new.
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
