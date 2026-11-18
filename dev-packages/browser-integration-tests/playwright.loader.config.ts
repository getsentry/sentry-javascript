import type { PlaywrightTestConfig } from '@playwright/test';
import CorePlaywrightConfig from './playwright.config';

const config: PlaywrightTestConfig = {
  ...CorePlaywrightConfig,
  workers: process.env.CI ? 4 : undefined,
  testDir: './loader-suites',
};

export default config;
