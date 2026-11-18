import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { orpcModuleNames } from '../../orchestrion/config/orpc';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import type { ORPCShouldHandleError } from './error-capture';
import { defaultShouldHandleError, instrumentORPCErrors } from './error-capture';
import type { SentryORPCTracerOptions } from './tracer';
import { SentryORPCTracer, setORPCTracer } from './tracer';

const INTEGRATION_NAME = 'ORPC' as const;

export interface ORPCIntegrationOptions extends SentryORPCTracerOptions {
  /**
   * Decides whether an error thrown by a procedure is captured as an issue.
   *
   * By default, `ORPCError`s that oRPC responds to with a 4xx status (e.g. the `NOT_FOUND` code) are not captured.
   * With a custom `errorStatusMap` on the oRPC handler, pass a matching `shouldHandleError`.
   */
  shouldHandleError?: ORPCShouldHandleError;
}

const _orpcIntegration = ((options: ORPCIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      setORPCTracer(new SentryORPCTracer(options));
    },
    setup(client) {
      invokeOrchestrionInstrumentation(
        client,
        orpcModuleNames,
        instrumentORPCErrors,
        [options.shouldHandleError ?? defaultShouldHandleError],
        { requiresTracingChannelBinding: false },
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing and error capture for [oRPC](https://orpc.dev) v2.
 *
 * oRPC looks up its tracer on `globalThis`, so its spans and the trace continuation of incoming requests
 * work without OpenTelemetry and without the Sentry runtime hook or bundler plugin. Capturing the errors
 * thrown by procedures requires the Sentry runtime hook or bundler plugin.
 */
export const orpcIntegration = defineIntegration(_orpcIntegration);
