import type { Config } from '@jest/types';
import { jsWithTs as jsWithTsPreset } from 'ts-jest/presets';

export default async (): Promise<Config.InitialOptions> => {
  return {
    ...jsWithTsPreset,
    globals: {
      'ts-jest': {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
      __DEBUG_BUILD__: true,
    },
    setupFilesAfterEnv: ['./jest.setup.ts'],
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/test/**/*(*.)@(spec|test).ts'],
  };
};
