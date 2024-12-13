import type { NodeClient } from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as solidStartInit } from '../../src/server';

const browserInit = vi.spyOn(SentryNode, 'init');

describe('Initialize Solid Start SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solidstart',
          packages: [
            { name: 'npm:@sentry/solidstart', version: SDK_VERSION },
            { name: 'npm:@sentry/node', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });

  it('filters out low quality transactions', async () => {
    const beforeSendEvent = vi.fn(event => event);
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    }) as NodeClient;
    client.on('beforeSendEvent', beforeSendEvent);

    client.captureEvent({ type: 'transaction', transaction: 'GET /' });
    client.captureEvent({ type: 'transaction', transaction: 'GET /_build/some_asset.js' });
    client.captureEvent({ type: 'transaction', transaction: 'POST /_server' });

    await client!.flush();

    expect(beforeSendEvent).toHaveBeenCalledTimes(2);
    expect(beforeSendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: 'GET /',
      }),
      expect.any(Object),
    );
    expect(beforeSendEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: 'GET /_build/some_asset.js',
      }),
      expect.any(Object),
    );
    expect(beforeSendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: 'POST /_server',
      }),
      expect.any(Object),
    );
  });
});
