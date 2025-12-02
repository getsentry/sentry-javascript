import * as SentryReact from '@sentry/react';
import { SDK_VERSION } from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const reactInit = vi.spyOn(SentryReact, 'init');

describe('TanStack Start React Client SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Adds TanStack Start React client metadata to the SDK options', () => {
      expect(reactInit).not.toHaveBeenCalled();

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
              { name: 'npm:@sentry/react', version: SDK_VERSION },
            ],
            settings: {
              infer_ip: 'never',
            },
          },
        },
      };

      expect(reactInit).toHaveBeenCalledTimes(1);
      expect(reactInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });
  });
});
