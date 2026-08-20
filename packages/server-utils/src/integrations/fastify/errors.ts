import type { FastifyIntegration, FastifyReply, FastifyRequest } from './types';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { captureException, getClient } from '@sentry/core';
import { defaultShouldHandleError, INTEGRATION_NAME } from './utils';

function getFastifyIntegration(): FastifyIntegration | undefined {
  const client = getClient();
  return client?.getIntegrationByName(INTEGRATION_NAME) as FastifyIntegration | undefined;
}

/**
 * Subscribe to the Fastify v5 error diagnostics channel.
 */
export function subscribeToFastifyErrorChannel(): void {
  diagnosticsChannel.subscribe('tracing:fastify.request.handler:error', message => {
    const { error, request, reply } = message as {
      error: Error;
      request: FastifyRequest;
      reply: FastifyReply;
    };

    handleFastifyError(error, request, reply);
  });
}

/**
 * Handle a Fastify error, and possibly send it to Sentry.
 *
 * On Fastify v5 a route handler error surfaces on both the diagnostics channel
 * and the `onError` hook, so this runs twice for the same error. That's fine:
 * `captureException` deduplicates by object identity (`__sentry_captured__`), so
 * only the first call sends an event. Errors that reach only one path (e.g.
 * thrown in an `onRequest` hook, or on Fastify v3/v4 which has no channel) are
 * captured once.
 */
export function handleFastifyError(error: Error, request: FastifyRequest, reply: FastifyReply): void {
  const shouldHandleError = getFastifyIntegration()?.getShouldHandleError() || defaultShouldHandleError;

  if (shouldHandleError(error, request, reply)) {
    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.function.fastify',
      },
    });
  }
}
