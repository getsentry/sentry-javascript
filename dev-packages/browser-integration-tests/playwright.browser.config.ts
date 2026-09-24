import type { PlaywrightTestConfig } from '@playwright/test';
import CorePlaywrightConfig from './playwright.config';

const config: PlaywrightTestConfig = {
  ...CorePlaywrightConfig,
  workers: process.env.CI ? 6 : CorePlaywrightConfig.workers,
  testDir: './suites',
};

export default config;
