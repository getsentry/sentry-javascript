import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { HonoInstrumentation } from './instrumentation';

const INTEGRATION_NAME = 'Hono';

export const instrumentHono = generateInstrumentOnce(
  INTEGRATION_NAME,
  () => new HonoInstrumentation(),
);

const _honoIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentHono();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Hono](https://hono.dev/).
 *
 * If you also want to capture errors, you need to call `setupHonoErrorHandler(app)` after you set up your Hono server.
 *
 * For more information, see the [hono documentation](https://docs.sentry.io/platforms/javascript/guides/hono/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.honoIntegration()],
 * })
 * ```
 */
export const honoIntegration = defineIntegration(_honoIntegration);
