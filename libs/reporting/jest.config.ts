export default {
  displayName: 'reporting',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.spec.json'}],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/reporting',
  coverageReporters: ['html', 'json-summary'],
  // As in the other libraries: without this, an untested file is absent from the report and
  // from the denominator, so a new module could ship uncovered.
  collectCoverageFrom: ['src/**/*.ts'],
  // The barrel re-exports and has no behaviour; the date-time and booking-rules libraries
  // exclude their own the same way.
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
