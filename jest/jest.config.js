module.exports = {
  rootDir: process.cwd(),
  collectCoverage: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.tsx$': 'ts-jest',
  },
  coverageDirectory: '<rootDir>/coverage',
  moduleFileExtensions: ['js', 'ts', 'tsx'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
    },
  },
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],
};
