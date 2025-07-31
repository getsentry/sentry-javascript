import type { Integration } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as LowQualityModule from '../../src/server/integration/lowQualityTransactionsFilterIntegration';
import { init as reactRouterInit } from '../../src/server/sdk';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('React Router server SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();

      SentryNode.getGlobalScope().clear();
      SentryNode.getIsolationScope().clear();
      SentryNode.getCurrentScope().clear();
      SentryNode.getCurrentScope().setClient(undefined);
    });

    it('adds React Router metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      reactRouterInit({});

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.react-router',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/react-router', version: SDK_VERSION },
                { name: 'npm:@sentry/node', version: SDK_VERSION },
              ],
            },
          },
        }),
      );
    });

    it('returns client from init', () => {
      const client = reactRouterInit({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      }) as NodeClient;
      expect(client).not.toBeUndefined();
    });

    it('adds the low quality transactions filter integration by default', () => {
      const filterSpy = vi.spyOn(LowQualityModule, 'lowQualityTransactionsFilterIntegration');

      reactRouterInit({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      expect(filterSpy).toHaveBeenCalled();

      expect(nodeInit).toHaveBeenCalledTimes(1);
      const initOptions = nodeInit.mock.calls[0]?.[0];

      expect(initOptions).toBeDefined();

      const defaultIntegrations = initOptions?.defaultIntegrations as Integration[];
      expect(Array.isArray(defaultIntegrations)).toBe(true);

      const filterIntegration = defaultIntegrations.find(
        integration => integration.name === 'LowQualityTransactionsFilter',
      );

      expect(filterIntegration).toBeDefined();
    });

    it('adds reactRouterServer integration by default', () => {
      reactRouterInit({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      expect(nodeInit).toHaveBeenCalledTimes(1);
      const initOptions = nodeInit.mock.calls[0]?.[0];
      const defaultIntegrations = initOptions?.defaultIntegrations as Integration[];

      const reactRouterServerIntegration = defaultIntegrations.find(
        integration => integration.name === 'ReactRouterServer',
      );

      expect(reactRouterServerIntegration).toBeDefined();
    });
  });
});
