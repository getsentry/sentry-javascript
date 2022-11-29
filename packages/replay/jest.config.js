const { pathsToModuleNameMapper } = require('ts-jest');
const { jsWithTs: jsWithTsPreset } = require('ts-jest/presets');

const { compilerOptions } = require('./tsconfig.test.json');

module.exports = {
  ...jsWithTsPreset,
  verbose: true,
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
    },
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
  setupFilesAfterEnv: ['./jest.setup.ts'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/**/*(*.)@(spec|test).ts'],
};
