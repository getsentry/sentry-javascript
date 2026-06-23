import type { FastifyIntegration, FastifyReply, FastifyRequest } from './types';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { DEBUG_BUILD } from '../../../debug-build';
import { getClient, debug, captureException } from '@sentry/core';
import { defaultShouldHandleError, INTEGRATION_NAME } from './utils';

function getFastifyIntegration(): FastifyIntegration | undefined {
  const client = getClient();
  return client?.getIntegrationByName(INTEGRATION_NAME);
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

    handleFastifyError.call(handleFastifyError, error, request, reply, 'diagnostics-channel');
  });
}

/**
 * Handle a Fastify error, and possibly send it to Sentry.
 */
export function handleFastifyError(
  this: {
    diagnosticsChannelExists?: boolean;
  },
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
  handlerOrigin: 'diagnostics-channel' | 'onError-hook',
): void {
  const shouldHandleError = getFastifyIntegration()?.getShouldHandleError() || defaultShouldHandleError;
  // Diagnostics channel runs before the onError hook, so we can use it to check if the handler was already registered
  if (handlerOrigin === 'diagnostics-channel') {
    this.diagnosticsChannelExists = true;
  }

  if (this.diagnosticsChannelExists && handlerOrigin === 'onError-hook') {
    DEBUG_BUILD &&
      debug.warn(
        'Fastify error handler was already registered via diagnostics channel.',
        'You can safely remove `setupFastifyErrorHandler` call and set `shouldHandleError` on the integration options.',
      );

    // If the diagnostics channel already exists, we don't need to handle the error again
    return;
  }

  if (shouldHandleError(error, request, reply)) {
    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.function.fastify',
      },
    });
  }
}
