module.exports = {
  rootDir: process.cwd(),
  collectCoverage: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: false,
    },
  },
};
