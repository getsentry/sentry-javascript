import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/server';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('TanStack Start React Server SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
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
  });
});
