module.exports = {
  forceExit: true,
  preset: 'ts-jest',
  collectCoverage: true,
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['benchmarks/'],
};
