import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/server';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('TanStack Start React Server SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      SentryNode.getCurrentScope().setClient(undefined);
    });

    it('Adds TanStack Start React server metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const expectedMetadata = {
        _metadata: {
          sdk: {
            name: 'sentry.javascript.tanstackstart-react',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/tanstackstart-react', version: SDK_VERSION },
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

    it('keeps the first client when called again', () => {
      const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(init({ dsn: 'https://other@dsn.ingest.sentry.io/42' })).toBe(firstClient);
      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(SentryNode.getClient()).toBe(firstClient);
    });

    it('initializes a new client after the first one is closed', async () => {
      const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
      await SentryNode.close();

      const secondClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(secondClient).not.toBe(firstClient);
      expect(nodeInit).toHaveBeenCalledTimes(2);
    });

    it('sets ignoreSpans to filter low-quality transactions', () => {
      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          ignoreSpans: expect.arrayContaining([/\/node_modules\//, /\/@id\//, /\/@react-refresh/, /\/@vite\//]),
        }),
      );
    });

    it('preserves user-defined ignoreSpans', () => {
      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        ignoreSpans: [/custom-pattern/],
      });

      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          ignoreSpans: expect.arrayContaining([/custom-pattern/, /\/@vite\//]),
        }),
      );
    });
  });
});
