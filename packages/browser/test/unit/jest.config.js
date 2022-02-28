module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverage: true,
  coverageDirectory: '../../coverage',
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsConfig: '../../tsconfig.json',
      diagnostics: false,
    },
  },
};
