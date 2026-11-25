import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { nitroAppModuleNames } from '../../orchestrion/config/nitro';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { captureNitroAppErrors } from './captureAppErrors';
import { captureStorageEvents } from './captureStorageEvents';
import { captureTracingEvents } from './captureTracingEvents';
import { captureServerTimingHeaders } from './setServerTimingHeaders';

const INTEGRATION_NAME = 'Nitro' as const;

export interface NitroIntegrationOptions {
  /**
   * Set `Server-Timing` response headers carrying the current `sentry-trace`/`baggage`, so the browser
   * SDK can connect a pageload trace to the backend trace.
   *
   * @default true
   */
  serverTiming?: boolean;

  /**
   * Create cache spans for unstorage operations.
   *
   * @default true
   */
  storage?: boolean;
}

const _nitroIntegration = ((options: NitroIntegrationOptions = {}) => {
  const { serverTiming = true, storage = true } = options;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      captureTracingEvents();

      if (storage) {
        captureStorageEvents();
      }

      if (serverTiming) {
        captureServerTimingHeaders();
      }
    },
    setup(client) {
      invokeOrchestrionInstrumentation(client, nitroAppModuleNames, captureNitroAppErrors, [], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments a Nitro server via its `node:diagnostics_channel` tracing channels: HTTP server and
 * middleware spans (h3/srvx), cache spans (unstorage), `Server-Timing` trace-propagation headers and
 * error capture.
 * It subscribes to those channels, so it is inert unless a Nitro app (or a framework that enables the
 * same tracing channels) is running.
 *
 * Registered regardless of whether tracing is enabled, because trace propagation must work in
 * tracing-without-performance mode too; without tracing, the spans it starts are non-recording.
 * Error capture is set up on the Nitro app either by `@sentry/nitro`'s runtime plugin or, through the
 * orchestrion `useNitroApp` channel, by this integration.
 */
export const nitroIntegration = defineIntegration(_nitroIntegration);
