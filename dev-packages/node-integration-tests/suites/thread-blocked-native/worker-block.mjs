import * as Sentry from '@sentry/node';
import { longWork } from './long-work.js';

// Wait for Sentry to be fully initialized before blocking.
// This prevents flaky tests on slow CI where the fixed 10s delay
// might fire before the native polling has started.
async function waitForSentryReady(timeoutMs = 30_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const client = Sentry.getClient();
    if (client?.getIntegrationByName('ThreadBlocked')) {
      // Integration is installed, wait a bit for polling to start
      // (polling starts via setImmediate in afterAllSetup)
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Timeout - the test will fail anyway since no event will be sent
}

waitForSentryReady().then(() => {
  longWork();
});
