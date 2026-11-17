import * as SentryNode from '@sentry/node';
import { originalConsoleMethods } from '@sentry/core';
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

    it('skips a second initialization and notifies that the `--import` preload is removable', () => {
      // `consoleSandbox` calls the method recorded in `originalConsoleMethods`, so a spy on `console.log` misses it.
      const logMock = vi.fn();
      const originalLog = originalConsoleMethods.log;
      originalConsoleMethods.log = logMock;

      try {
        const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
        const secondClient = init({ dsn: 'https://other@dsn.ingest.sentry.io/42' });

        expect(nodeInit).toHaveBeenCalledTimes(1);
        expect(secondClient).toBe(firstClient);
        expect(SentryNode.getClient()).toBe(firstClient);
        expect(logMock).toHaveBeenCalledWith(expect.stringContaining('already initialized'));
      } finally {
        originalConsoleMethods.log = originalLog;
      }
    });

    it('initializes again after close()', async () => {
      const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
      await SentryNode.close();

      const secondClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(nodeInit).toHaveBeenCalledTimes(2);
      expect(secondClient).not.toBe(firstClient);
    });

    it('skips initialization while TanStack Start prerenders', () => {
      vi.stubEnv('TSS_PRERENDERING', 'true');

      try {
        expect(init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' })).toBeUndefined();
        expect(nodeInit).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
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
