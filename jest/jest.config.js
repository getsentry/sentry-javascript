const jest_workaround = require.resolve('jest_workaround');

const swrc = {
  jsc: {
    experimental: {
      keepImportAssertions: true,
      plugins: [[jest_workaround, {}]],
    },
  },
  module: {
    type: 'commonjs',
  },
};

module.exports = {
  // this is the package root, even when tests are being run at the repo level
  rootDir: process.cwd(),
  collectCoverage: true,
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', swrc],
  },
  coverageDirectory: '<rootDir>/coverage',
  moduleFileExtensions: ['js', 'ts', 'tsx'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
    },
    __DEBUG_BUILD__: true,
  },
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],
};
