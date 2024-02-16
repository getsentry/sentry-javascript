import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { vi } from 'vitest';

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

    it('adds Astro metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      init({});

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.astro',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/astro', version: SDK_VERSION },
                { name: 'npm:@sentry/node', version: SDK_VERSION },
              ],
            },
          },
        }),
      );
    });

    it('sets the runtime tag on the isolation scope', () => {
      expect(SentryNode.getIsolationScope().getScopeData().tags).toEqual({});

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(SentryNode.getIsolationScope().getScopeData().tags).toEqual({ runtime: 'node' });
    });
  });
});
