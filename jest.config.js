module.exports = {
  rootDir: process.cwd(),
  collectCoverage: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.tsx$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'ts', 'tsx'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: false,
    },
  },
};
