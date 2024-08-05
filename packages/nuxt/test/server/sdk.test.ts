import * as SentryNode from '@sentry/node';
import type { NodeClient } from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/server';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('Nuxt Server SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Adds Nuxt metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const expectedMetadata = {
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nuxt',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
              { name: 'npm:@sentry/node', version: SDK_VERSION },
            ],
          },
        },
      };

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });

    it('filters out low quality transactions', async () => {
      const beforeSendEvent = vi.fn(event => event);
      const client = init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      }) as NodeClient;
      client.on('beforeSendEvent', beforeSendEvent);

      client.captureEvent({ type: 'transaction', transaction: 'GET /' });
      client.captureEvent({ type: 'transaction', transaction: 'GET /_nuxt/some_asset.js' });
      // Although this has the name of the build asset directory (_nuxt), it should not be filtered out as it would not match the regex
      client.captureEvent({ type: 'transaction', transaction: 'GET _nuxt/some_asset.js' });
      client.captureEvent({ type: 'transaction', transaction: 'POST /_server' });

      await client!.flush();

      expect(beforeSendEvent).toHaveBeenCalledTimes(3);
      expect(beforeSendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: 'GET /',
        }),
        expect.any(Object),
      );
      expect(beforeSendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: 'GET _nuxt/some_asset.js',
        }),
        expect.any(Object),
      );
      expect(beforeSendEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: 'GET /_nuxt/some_asset.js',
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
});
