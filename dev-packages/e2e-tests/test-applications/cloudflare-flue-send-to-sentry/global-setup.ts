import { randomBytes } from 'node:crypto';
import type { FullConfig } from '@playwright/test';
import { createWorkerGlobalSetup } from '@sentry-internal/test-utils/cloudflare';

const deployWorker = createWorkerGlobalSetup({
  workerPrefix: 'e2e-flue-send-to-sentry',
  secrets: { OPENROUTER_API_KEY: 'E2E_OPENROUTER_API_KEY', E2E_TEST_WORKER_TOKEN: 'E2E_TEST_WORKER_TOKEN' },
});

/**
 * CI keeps the Worker after the run, and it holds an OpenRouter key. So its agent routes only accept
 * this token, which is new for every deploy and only known to the test run that deployed the Worker.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  process.env.E2E_TEST_WORKER_TOKEN = randomBytes(32).toString('hex');
  await deployWorker(config);
}
