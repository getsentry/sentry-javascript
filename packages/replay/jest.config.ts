import type { Config } from '@jest/types';
import { pathsToModuleNameMapper } from 'ts-jest';

import { compilerOptions } from './tsconfig.test.json';

import { jsWithTs as jsWithTsPreset } from 'ts-jest/presets';

export default async (): Promise<Config.InitialOptions> => {
  console.log(jsWithTsPreset);

  return {
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
    globals: {
      'ts-jest': {
        tsconfig: '<rootDir>/tsconfig.json',
      },
      __DEBUG_BUILD__: true,
    },
  };
};
