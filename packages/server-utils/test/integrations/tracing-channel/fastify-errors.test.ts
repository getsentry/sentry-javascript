import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { handleFastifyError } from '../../../src/integrations/tracing-channel/fastify/errors';
import { fastifyIntegration } from '../../../src/integrations/tracing-channel/fastify/index';
import type { FastifyReply, FastifyRequest } from '../../../src/integrations/tracing-channel/fastify/types';

type ShouldHandleError = (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;

const request = {} as FastifyRequest;

function reply(statusCode: number): FastifyReply {
  return { statusCode } as FastifyReply;
}

/** Register a `Fastify` integration exposing `shouldHandleError`, as `fastifyIntegration()` does. */
function mockFastifyIntegration(shouldHandleError?: ShouldHandleError): void {
  vi.spyOn(SentryCore, 'getClient').mockReturnValue({
    getIntegrationByName: (name: string) =>
      name === 'Fastify' ? { name, getShouldHandleError: () => shouldHandleError } : undefined,
  } as unknown as SentryCore.Client);
}

describe('handleFastifyError', () => {
  let captureExceptionSpy: MockInstance;

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('eventId');
    // `handleFastifyError` keeps `diagnosticsChannelExists` on the function object itself, so it
    // survives between tests unless it is cleared.
    (handleFastifyError as { diagnosticsChannelExists?: boolean }).diagnosticsChannelExists = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The `onError` hook is the path `setupFastifyErrorHandler` registers — Fastify v3 and v4.
  describe('via the `onError` hook', () => {
    it('skips the error when the integration option returns false', () => {
      mockFastifyIntegration(() => false);

      handleFastifyError.call(handleFastifyError, new Error('err'), request, reply(500), 'onError-hook');

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('captures the error when the integration option returns true', () => {
      mockFastifyIntegration(() => true);

      handleFastifyError.call(handleFastifyError, new Error('err'), request, reply(404), 'onError-hook');

      expect(captureExceptionSpy).toHaveBeenCalledOnce();
    });
  });

  // Fastify v5 publishes errors on a diagnostics channel, which the integration subscribes to.
  describe('via the diagnostics channel', () => {
    it('skips the error when the integration option returns false', () => {
      mockFastifyIntegration(() => false);

      handleFastifyError.call(handleFastifyError, new Error('err'), request, reply(500), 'diagnostics-channel');

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('captures the error when the integration option returns true', () => {
      mockFastifyIntegration(() => true);

      handleFastifyError.call(handleFastifyError, new Error('err'), request, reply(404), 'diagnostics-channel');

      expect(captureExceptionSpy).toHaveBeenCalledOnce();
    });
  });

  it('falls back to the default gate when the integration sets no option', () => {
    mockFastifyIntegration(undefined);

    handleFastifyError.call(handleFastifyError, new Error('client'), request, reply(404), 'onError-hook');
    expect(captureExceptionSpy).not.toHaveBeenCalled();

    handleFastifyError.call(handleFastifyError, new Error('server'), request, reply(503), 'onError-hook');
    expect(captureExceptionSpy).toHaveBeenCalledOnce();
  });
});

describe('fastifyIntegration', () => {
  it('exposes the configured `shouldHandleError` so the `onError` hook can read it back', () => {
    const shouldHandleError: ShouldHandleError = () => false;
    const integration = fastifyIntegration({ shouldHandleError });

    integration.setupOnce?.();

    expect(integration.getShouldHandleError()).toBe(shouldHandleError);
  });

  it('falls back to the default gate when no option is configured', () => {
    const integration = fastifyIntegration();

    integration.setupOnce?.();

    const gate = integration.getShouldHandleError();
    expect(gate(new Error('client'), request, reply(404))).toBe(false);
    expect(gate(new Error('server'), request, reply(503))).toBe(true);
  });
});
