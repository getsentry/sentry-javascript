import type { PlaywrightTestConfig } from '@playwright/test';
import CorePlaywrightConfig from './playwright.config';

const config: PlaywrightTestConfig = {
  ...CorePlaywrightConfig,
  testDir: './suites',
};

export default config;
