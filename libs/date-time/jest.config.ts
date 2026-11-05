export default {
  displayName: 'date-time',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.spec.json'}],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/date-time',
  coverageReporters: ['html', 'json-summary'],
  // As on the server: without this, an untested file is absent from the report and
  // from the denominator, so a new module could ship uncovered.
  collectCoverageFrom: ['src/**/*.ts'],
  // The barrel re-exports and has no behaviour; the server excludes its equivalents the same way.
  coveragePathIgnorePatterns: ['\\.spec\\.ts$', '/src/index\\.ts$'],
  // The constitution requires 100 % on files added or modified, and this library is new.
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
