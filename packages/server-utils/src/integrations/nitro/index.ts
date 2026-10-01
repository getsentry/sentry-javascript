import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { captureStorageEvents } from './captureStorageEvents';
import { captureTracingEvents } from './captureTracingEvents';
import { captureServerTimingHeaders } from './setServerTimingHeaders';

const INTEGRATION_NAME = 'Nitro';

const _nitroIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      captureTracingEvents();
      captureStorageEvents();
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments a Nitro server via its `node:diagnostics_channel` tracing channels: HTTP server and
 * middleware spans (h3/srvx) and cache spans (unstorage). It subscribes to those channels, so it is
 * inert unless a Nitro app (or a framework that enables the same tracing channels) is running.
 *
 * Only creates spans, so it is registered as a tracing integration (active only when tracing is
 * enabled). Trace-propagation headers are handled separately by {@link nitroServerTimingIntegration},
 * and error capture by the `@sentry/nitro` runtime plugin's Nitro `error` hook.
 */
export const nitroIntegration = defineIntegration(_nitroIntegration);

const SERVER_TIMING_INTEGRATION_NAME = 'NitroServerTiming';

const _nitroServerTimingIntegration = (() => {
  return {
    name: SERVER_TIMING_INTEGRATION_NAME,
    setupOnce() {
      captureServerTimingHeaders();
    },
  };
}) satisfies IntegrationFn;

/**
 * Sets `Server-Timing` response headers carrying the current `sentry-trace`/`baggage` on every
 * response served through Nitro's h3 request channel, so the browser SDK can connect a pageload
 * trace to the backend trace.
 *
 * Registered as a default (non-tracing) integration because trace propagation must work even in
 * tracing-without-performance mode. It only appends headers when the h3 request channel fires, so it
 * is inert outside Nitro. Opt out by excluding it from `integrations`.
 */
export const nitroServerTimingIntegration = defineIntegration(_nitroServerTimingIntegration);
