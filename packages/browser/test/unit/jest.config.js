module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
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
