import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { orpcModuleNames } from '../../orchestrion/config/orpc';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import type { ORPCShouldHandleError } from './instrumentation';
import { defaultShouldHandleError, instrumentORPC } from './instrumentation';

const INTEGRATION_NAME = 'ORPC' as const;

export interface ORPCIntegrationOptions {
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
    setup(client) {
      invokeOrchestrionInstrumentation(client, orpcModuleNames, instrumentORPC, [
        options.shouldHandleError ?? defaultShouldHandleError,
      ]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing and error capture for [oRPC](https://orpc.dev) v2 procedures.
 *
 * Requires the Sentry runtime hook or bundler plugin, which instrument `@orpc/server`.
 */
export const orpcIntegration = defineIntegration(_orpcIntegration);
