import { createWorkerGlobalSetup } from '@sentry-internal/test-utils/cloudflare';

export default createWorkerGlobalSetup({
  workerPrefix: 'e2e-flue-send-to-sentry',
  secrets: { OPENROUTER_API_KEY: 'E2E_OPENROUTER_API_KEY' },
});
