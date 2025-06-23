import type { NodeClient } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { getClient, SDK_VERSION } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/server/sdk';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('Sentry server SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();

      SentryNode.getGlobalScope().clear();
      SentryNode.getIsolationScope().clear();
      SentryNode.getCurrentScope().clear();
      SentryNode.getCurrentScope().setClient(undefined);
    });

    it('adds SvelteKit metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      init({});

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.sveltekit',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/sveltekit', version: SDK_VERSION },
                { name: 'npm:@sentry/node', version: SDK_VERSION },
              ],
            },
          },
        }),
      );
    });

    it('adds rewriteFramesIntegration by default', () => {
      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const rewriteFramesIntegration = getClient<NodeClient>()?.getIntegrationByName('RewriteFrames');
      expect(rewriteFramesIntegration).toBeDefined();
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
