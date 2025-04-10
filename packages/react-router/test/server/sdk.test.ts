import { afterEach, describe, expect, it, vi } from 'vitest';

import * as SentryNode from '@sentry/node';

import { SDK_VERSION } from '@sentry/node';

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
      expect(reactRouterInit({})).not.toBeUndefined();
    });
  });
});
