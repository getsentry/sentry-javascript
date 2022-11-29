import type { Config } from '@jest/types';
import { pathsToModuleNameMapper } from 'ts-jest';
import { jsWithTs as jsWithTsPreset } from 'ts-jest/presets';

import { compilerOptions } from './tsconfig.test.json';

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
