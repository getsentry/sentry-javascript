module.exports = {
  // this is the package root, even when tests are being run at the repo level
  rootDir: process.cwd(),
  collectCoverage: true,
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  coverageDirectory: '<rootDir>/coverage',
  moduleFileExtensions: ['js', 'ts', 'tsx'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
    '@opentelemetry/semantic-conventions/incubating': require.resolve('@opentelemetry/semantic-conventions/incubating'),
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: {
        // Ignore this warning for tests, we do not care about this
        ignoreCodes: ['TS151001'],
      },
    },
    __DEBUG_BUILD__: true,
  },
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],

  // On CI, we do not need the pretty CLI output, as it makes logs harder to parse
  ...(process.env.CI
    ? {
        coverageReporters: ['json', 'lcov', 'clover'],
        reporters: [
          'default',
          [
            'jest-junit',
            {
              outputName: 'jest.junit.xml',
              classNameTemplate: '{filepath}',
            },
          ],
        ],
      }
    : {}),
};
