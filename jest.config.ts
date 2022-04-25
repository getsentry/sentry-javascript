import { pathsToModuleNameMapper } from 'ts-jest';
import type { Config } from '@jest/types';

import { compilerOptions } from './tsconfig.json';

export default async (): Promise<Config.InitialOptions> => {
  return {
    verbose: true,
    preset: 'ts-jest',
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: '<rootDir>/',
    }),
    setupFilesAfterEnv: ['./jest.setup.ts'],
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/src/**/*(*.)@(spec|test).ts'],
  };
};
