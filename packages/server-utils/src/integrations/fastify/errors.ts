import type { FastifyIntegration, FastifyReply, FastifyRequest } from './types';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { addNonEnumerableProperty, captureException, getClient } from '@sentry/core';
import { defaultShouldHandleError, INTEGRATION_NAME } from './utils';

// Marks a request whose error has already been captured, so the two code paths that surface the same
// error (the diagnostics channel and the `onError` hook on Fastify v5) don't send it twice.
const kErrorCaptured = Symbol('sentry.fastifyErrorCaptured');

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

    handleFastifyError(request, reply, error);
  });
}

/**
 * Handle a Fastify error, and possibly send it to Sentry.
 *
 * On Fastify v5 a route handler error surfaces on both the diagnostics channel
 * and the `onError` hook, so this runs twice for the same request. We mark the
 * request with a non-enumerable symbol once it has been captured, and bail out
 * on subsequent calls, so the same error is only sent once. Errors that reach
 * only one path (e.g. thrown in an `onRequest` hook, or on Fastify v3/v4 which
 * has no channel) are captured once.
 */
export function handleFastifyError(request: FastifyRequest, reply: FastifyReply, error: Error): void {
  if ((request as Record<symbol, unknown>)[kErrorCaptured]) {
    return;
  }

  const shouldHandleError = getFastifyIntegration()?.getShouldHandleError() || defaultShouldHandleError;

  if (shouldHandleError(error, request, reply)) {
    addNonEnumerableProperty(request, kErrorCaptured, true);

    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.function.fastify',
      },
    });
  }
}
