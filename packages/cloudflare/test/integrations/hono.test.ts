import * as sentryCore from '@sentry/core';
import { type Client, createStackParser } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudflareClient } from '../../src/client';
import { honoIntegration } from '../../src/integrations/hono';

class FakeClient extends CloudflareClient {
  public getIntegrationByName(name: string) {
    return name === 'Hono' ? (honoIntegration() as any) : undefined;
  }
}

type MockHonoIntegrationType = { handleHonoException: (err: Error) => void };

describe('Hono integration', () => {
  let client: FakeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new FakeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: [],
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
      stackParser: createStackParser(),
    });

    vi.spyOn(sentryCore, 'getClient').mockImplementation(() => client as Client);
  });

  it('captures in errorHandler when onError exists', () => {
    const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException');
    const integration = honoIntegration();
    integration.setupOnce?.();

    const error = new Error('hono boom');
    // simulate withSentry wrapping of errorHandler calling back into integration
    (integration as unknown as MockHonoIntegrationType).handleHonoException(error);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
      mechanism: { handled: false, type: 'auto.faas.hono.error_handler' },
    });
  });

  it('does not capture for 4xx status', () => {
    const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException');
    const integration = honoIntegration();
    integration.setupOnce?.();

    (integration as unknown as MockHonoIntegrationType).handleHonoException(
      Object.assign(new Error('client err'), { status: 404 }),
    );
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('does not capture for 3xx status', () => {
    const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException');
    const integration = honoIntegration();
    integration.setupOnce?.();

    (integration as unknown as MockHonoIntegrationType).handleHonoException(
      Object.assign(new Error('redirect'), { status: 302 }),
    );
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('captures for 5xx status', () => {
    const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException');
    const integration = honoIntegration();
    integration.setupOnce?.();

    const err = Object.assign(new Error('server err'), { status: 500 });
    (integration as unknown as MockHonoIntegrationType).handleHonoException(err);
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('captures if no status is present on Error', () => {
    const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException');
    const integration = honoIntegration();
    integration.setupOnce?.();

    (integration as unknown as MockHonoIntegrationType).handleHonoException(new Error('no status'));
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('supports custom shouldHandleError option', () => {
    const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException');
    const integration = honoIntegration({ shouldHandleError: () => false });
    integration.setupOnce?.();

    (integration as unknown as MockHonoIntegrationType).handleHonoException(new Error('blocked'));
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });
});
