import * as http from 'node:http';
import type { Envelope, EventEnvelope } from '@sentry/core';
import { createEnvelope, debug } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spotlightIntegration } from '../../src/integrations/spotlight';
import { NodeClient } from '../../src/sdk/client';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';

vi.mock('node:http', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const original = (await vi.importActual('node:http')) as typeof import('node:http');
  return {
    ...original,
    request: original.request,
  };
});

describe('Spotlight', () => {
  const debugSpy = vi.spyOn(debug, 'warn');

  afterEach(() => {
    debugSpy.mockClear();
    vi.clearAllMocks();
  });

  const options = getDefaultNodeClientOptions();
  const client = new NodeClient(options);

  it('has a name', () => {
    const integration = spotlightIntegration();
    expect(integration.name).toEqual('Spotlight');
  });

  it('registers a callback on the `beforeEnvelope` hook', () => {
    const clientWithSpy = {
      ...client,
      on: vi.fn(),
    };
    const integration = spotlightIntegration();
    // @ts-expect-error - this is fine in tests
    integration.setup(clientWithSpy);
    expect(clientWithSpy.on).toHaveBeenCalledWith('beforeEnvelope', expect.any(Function));
  });

  it('sends an envelope POST request to the sidecar url', () => {
    const httpSpy = vi.spyOn(http, 'request').mockImplementationOnce(() => {
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      } as any;
    });

    let callback: (envelope: Envelope) => void = () => {};
    const clientWithSpy = {
      ...client,
      on: vi.fn().mockImplementationOnce((_, cb) => (callback = cb)),
    };

    const integration = spotlightIntegration();
    // @ts-expect-error - this is fine in tests
    integration.setup(clientWithSpy);

    const envelope = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
      [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
    ]);

    callback(envelope);

    expect(httpSpy).toHaveBeenCalledWith(
      {
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
        hostname: 'localhost',
        method: 'POST',
        path: '/stream',
        port: '8969',
      },
      expect.any(Function),
    );
  });

  it('sends an envelope POST request to a custom sidecar url', () => {
    const httpSpy = vi.spyOn(http, 'request').mockImplementationOnce(() => {
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      } as any;
    });

    let callback: (envelope: Envelope) => void = () => {};
    const clientWithSpy = {
      ...client,
      on: vi.fn().mockImplementationOnce((_, cb) => (callback = cb)),
    };

    const integration = spotlightIntegration({ sidecarUrl: 'http://mylocalhost:8888/abcd' });
    // @ts-expect-error - this is fine in tests
    integration.setup(clientWithSpy);

    const envelope = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
      [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
    ]);

    callback(envelope);

    expect(httpSpy).toHaveBeenCalledWith(
      {
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
        hostname: 'mylocalhost',
        method: 'POST',
        path: '/abcd',
        port: '8888',
      },
      expect.any(Function),
    );
  });

  describe('no-ops if', () => {
    it('an invalid URL is passed', () => {
      const integration = spotlightIntegration({ sidecarUrl: 'invalid-url' });
      integration.setup!(client);
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid sidecar URL: invalid-url'));
    });
  });

  it('warns if the NODE_ENV variable doesn\'t equal "development"', () => {
    const oldEnvValue = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const integration = spotlightIntegration({ sidecarUrl: 'http://localhost:8969' });
    integration.setup!(client);

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("It seems you're not in dev mode. Do you really want to have Spotlight enabled?"),
    );

    process.env.NODE_ENV = oldEnvValue;
  });

  it('doesn\'t warn if the NODE_ENV variable equals "development"', () => {
    const oldEnvValue = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const integration = spotlightIntegration({ sidecarUrl: 'http://localhost:8969' });
    integration.setup!(client);

    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("It seems you're not in dev mode. Do you really want to have Spotlight enabled?"),
    );

    process.env.NODE_ENV = oldEnvValue;
  });

  it('handles `process` not being available', () => {
    const originalProcess = process;

    // @ts-expect-error - TS complains but we explicitly wanna test this
    delete global.process;

    const integration = spotlightIntegration({ sidecarUrl: 'http://localhost:8969' });
    integration.setup!(client);

    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("It seems you're not in dev mode. Do you really want to have Spotlight enabled?"),
    );

    global.process = originalProcess;
  });

  it('handles `process.env` not being available', () => {
    const originalEnv = process.env;

    // @ts-expect-error - TS complains but we explicitly wanna test this
    delete process.env;

    const integration = spotlightIntegration({ sidecarUrl: 'http://localhost:8969' });
    integration.setup!(client);

    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("It seems you're not in dev mode. Do you really want to have Spotlight enabled?"),
    );

    process.env = originalEnv;
  });
});
