// NOTE: The paths used here assume tests are being run from the root level of a package, either manually or via the
// repo-level `yarn test` script, which sets the cwd of each package's corresponding yarn script to be the package root.

module.exports = {
  rootDir: process.cwd(), // package root
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
      astTransformers: {
        after: ['<rootDir>/../../jest/transformers/constReplacer.ts'],
      },
    },
  },
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],
};
