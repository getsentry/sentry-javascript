import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
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

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });

    it('configures ignoreSpans to drop prerendered http.server spans', () => {
      init({});

      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          ignoreSpans: expect.arrayContaining([
            { op: 'http.server', attributes: { 'sentry.origin': 'auto.http.otel.http' } },
          ]),
        }),
      );
    });

    it('preserves user-provided ignoreSpans entries', () => {
      init({ ignoreSpans: [/keep-me/] });

      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          ignoreSpans: expect.arrayContaining([/keep-me/]),
        }),
      );
    });
  });
});
