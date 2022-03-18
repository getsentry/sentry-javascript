const config = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  testMatch: ['**/test.ts'],
  moduleFileExtensions: ['js', 'ts'],
};

module.exports = config;
