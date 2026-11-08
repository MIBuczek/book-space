export default {
  displayName: 'version',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.spec.json'}],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/version',
  coverageReporters: ['html', 'json-summary'],
  collectCoverageFrom: ['src/**/*.ts'],
  // The barrel re-exports and has no behaviour; the other libraries exclude it the same way.
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
