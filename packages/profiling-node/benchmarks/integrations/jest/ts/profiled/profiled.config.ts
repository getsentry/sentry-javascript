import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  testMatch: ['<rootDir>/profiled.test.ts'],
  testEnvironment: '<rootDir>/profiled.env.ts'
};

export default config;
