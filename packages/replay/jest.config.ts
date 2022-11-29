import type { Config } from '@jest/types';
import { pathsToModuleNameMapper } from 'ts-jest';

// @ts-ignore
import test from '../../jest/jest.config';
import { compilerOptions } from './tsconfig.test.json';

export default async (): Promise<Config.InitialOptions> => {
  return {
    ...test,
    verbose: true,
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: '<rootDir>/',
    }),
    setupFilesAfterEnv: ['./jest.setup.ts'],
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/test/**/*(*.)@(spec|test).ts'],
  };
};
