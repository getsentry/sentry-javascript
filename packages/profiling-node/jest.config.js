module.exports = {
  verbose: true,
  forceExit: true,
  collectCoverage: true,
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['benchmarks/'],
  resetMocks: true,
  restoreMocks: true,
  silent: false,
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
};
