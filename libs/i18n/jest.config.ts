export default {
  displayName: 'i18n',
  preset: '../../jest.preset.js',
  // The store and the provider use Angular DI and `localStorage`, so this library is tested in
  // a DOM environment like the app, not in node like the pure `date-time`/`reporting` libraries.
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
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
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/i18n',
  coverageReporters: ['html', 'json-summary'],
  collectCoverageFrom: ['src/**/*.ts'],
  // The barrel re-exports and the test setup installs DOM stubs; neither has behaviour to cover.
  coveragePathIgnorePatterns: ['\\.spec\\.ts$', '/src/index\\.ts$', '/src/test-setup\\.ts$'],
  // The constitution requires 100 % on files added or modified, and this library is new.
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
