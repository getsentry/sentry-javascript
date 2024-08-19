module.exports = {
  // this is the package root, even when tests are being run at the repo level
  rootDir: process.cwd(),
  collectCoverage: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.tsx$': 'ts-jest',
  },
  coverageDirectory: '<rootDir>/coverage',
  moduleFileExtensions: ['js', 'ts', 'tsx'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
    },
    __DEBUG_BUILD__: true,
  },
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],

  // On CI, we do not need the pretty CLI output, as it makes logs harder to parse
  ...(process.env.CI
    ? {
        coverageReporters: ['json', 'lcov', 'clover'],
      }
    : {}),
};
