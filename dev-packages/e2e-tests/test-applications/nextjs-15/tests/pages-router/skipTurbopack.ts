import { test } from '@playwright/test';

export function skipTurbopack(): void {
  // The SDK wraps pages router data fetchers and API routes with webpack loaders, which Turbopack doesn't run.
  test.skip(!!process.env.TEST_ENV?.includes('turbopack'), 'Pages router auto-wrapping is webpack-only');
}
