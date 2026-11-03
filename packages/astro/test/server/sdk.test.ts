import { getMainCarrier } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/server/sdk';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('Sentry server SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();
      vi.unstubAllGlobals();

      getMainCarrier().__SENTRY__ = undefined;
    });

    it("doesn't initialize the SDK in the Vercel Edge runtime", () => {
      vi.stubGlobal('EdgeRuntime', 'edge-runtime');

      expect(init({})).toBeUndefined();
      expect(nodeInit).not.toHaveBeenCalled();
    });

    it("doesn't initialize the SDK in Netlify edge functions", () => {
      vi.stubGlobal('Netlify', {});
      vi.stubGlobal('Deno', {});

      expect(init({})).toBeUndefined();
      expect(nodeInit).not.toHaveBeenCalled();
    });

    it('initializes the SDK in Netlify Node functions', () => {
      vi.stubGlobal('Netlify', {});

      init({});

      expect(nodeInit).toHaveBeenCalledTimes(1);
    });

    it('initializes the SDK in Deno', () => {
      vi.stubGlobal('Deno', {});

      init({});

      expect(nodeInit).toHaveBeenCalledTimes(1);
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
            { op: 'http.server', attributes: { 'sentry.origin': 'auto.http.http_server' } },
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
