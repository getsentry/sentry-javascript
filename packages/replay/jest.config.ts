import type { JestConfigWithTsJest } from 'ts-jest';
import { jsWithTs as jsWithTsPreset } from 'ts-jest/presets';

const config: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/js-with-ts',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
    '^.+\\.tsx$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
  globals: {
    __DEBUG_BUILD__: true,
  },
  setupFilesAfterEnv: ['./jest.setup.ts'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/**/*(*.)@(spec|test).ts'],
};

export default config;
