import type { PlaywrightTestConfig } from '@playwright/test';
import CorePlaywrightConfig from './playwright.config';

const config: PlaywrightTestConfig = {
  ...CorePlaywrightConfig,
  testDir: './loader-suites',
};

export default config;
