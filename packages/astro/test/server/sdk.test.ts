import * as SentryNode from '@sentry/node';
import { type NodeOptions, SDK_VERSION } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { init, mergeRegisterEsmLoaderHooks } from '../../src/server/sdk';

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
  });

  describe('mergeRegisterEsmLoaderHooks', () => {
    it('merges exclude array when registerEsmLoaderHooks is an object with an exclude array', () => {
      const options: NodeOptions = {
        registerEsmLoaderHooks: { exclude: [/test/] },
      };
      const result = mergeRegisterEsmLoaderHooks(options);
      expect(result).toEqual({ exclude: [/test/, /vue/] });
    });

    it('sets exclude array when registerEsmLoaderHooks is an object without an exclude array', () => {
      const options: NodeOptions = {
        registerEsmLoaderHooks: {},
      };
      const result = mergeRegisterEsmLoaderHooks(options);
      expect(result).toEqual({ exclude: [/vue/] });
    });

    it('returns boolean when registerEsmLoaderHooks is a boolean', () => {
      const options1: NodeOptions = {
        registerEsmLoaderHooks: true,
      };
      const result1 = mergeRegisterEsmLoaderHooks(options1);
      expect(result1).toBe(true);

      const options2: NodeOptions = {
        registerEsmLoaderHooks: false,
      };
      const result2 = mergeRegisterEsmLoaderHooks(options2);
      expect(result2).toBe(false);
    });

    it('sets exclude array when registerEsmLoaderHooks is undefined', () => {
      const options: NodeOptions = {};
      const result = mergeRegisterEsmLoaderHooks(options);
      expect(result).toEqual({ exclude: [/vue/] });
    });
  });
});
