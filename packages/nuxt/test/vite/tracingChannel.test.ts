import type { Nuxt } from '@nuxt/schema';
import { describe, expect, it } from 'vitest';
import { enableNuxtTracingChannels } from '../../src/vite/tracingChannel';

type LayerConfig = { tracingChannel?: unknown; nitro?: { tracingChannel?: unknown } };

interface MockNuxtOptions {
  version?: string;
  /** The raw config of each layer, the app first. */
  layers?: Array<LayerConfig | null>;
  /** What Nuxt resolved from the layers. `false` for an app that sets no option. */
  resolved?: unknown;
}

function createMockNuxt({ version = '4.7.0', layers = [{}], resolved = false }: MockNuxtOptions = {}): Nuxt {
  return {
    _version: version,
    options: { tracingChannel: resolved, _layers: layers.map(config => ({ config })) },
    // The version check of `@nuxt/kit` calls the `kit:compatibility` hook.
    callHook: () => Promise.resolve(),
  } as unknown as Nuxt;
}

const ONLY_NUXT_CHANNELS = { nuxt: true, srvx: false, h3: false, unstorage: false, db0: false };

describe('enableNuxtTracingChannels', () => {
  it('turns on only the Nuxt channel group when the app sets no option', async () => {
    const nuxt = createMockNuxt();

    await enableNuxtTracingChannels(nuxt, 'nitro3');

    expect(nuxt.options.tracingChannel).toEqual(ONLY_NUXT_CHANNELS);
  });

  it.each(['nitro2', 'nuxt'] as const)('writes no Nitro channel group on the `%s` server API', async serverApi => {
    const nuxt = createMockNuxt();

    await enableNuxtTracingChannels(nuxt, serverApi);

    expect(nuxt.options.tracingChannel).toEqual({ nuxt: true });
  });

  it.each([
    { userValue: { h3: true }, expected: { ...ONLY_NUXT_CHANNELS, h3: true } },
    { userValue: { nuxt: false }, expected: { ...ONLY_NUXT_CHANNELS, nuxt: false } },
    {
      userValue: { nuxt: false, unstorage: true, db0: true },
      expected: { ...ONLY_NUXT_CHANNELS, nuxt: false, unstorage: true, db0: true },
    },
    { userValue: {}, expected: ONLY_NUXT_CHANNELS },
  ])('keeps the keys that the app sets: $userValue', async ({ userValue, expected }) => {
    const nuxt = createMockNuxt({ layers: [{ tracingChannel: userValue }], resolved: { nuxt: true, ...userValue } });

    await enableNuxtTracingChannels(nuxt, 'nitro3');

    expect(nuxt.options.tracingChannel).toEqual(expected);
  });

  it.each([
    { userValue: false, resolved: false },
    { userValue: true, resolved: { nuxt: true } },
  ])('keeps the value of Nuxt when the app sets the whole option to $userValue', async ({ userValue, resolved }) => {
    const nuxt = createMockNuxt({ layers: [{ tracingChannel: userValue }], resolved });

    await enableNuxtTracingChannels(nuxt, 'nitro3');

    expect(nuxt.options.tracingChannel).toBe(resolved);
  });

  it('keeps a value that no layer sets, for example the value of another module', async () => {
    const valueOfOtherModule = { nuxt: true, h3: true };
    const nuxt = createMockNuxt({ resolved: valueOfOtherModule });

    await enableNuxtTracingChannels(nuxt, 'nitro3');

    expect(nuxt.options.tracingChannel).toBe(valueOfOtherModule);
  });

  describe('with layers', () => {
    it('keeps the keys that an extended layer sets', async () => {
      const nuxt = createMockNuxt({ layers: [{}, { tracingChannel: { unstorage: true } }] });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toEqual({ ...ONLY_NUXT_CHANNELS, unstorage: true });
    });

    it('prefers the key of the app over the same key of an extended layer', async () => {
      const nuxt = createMockNuxt({
        layers: [{ tracingChannel: { h3: true } }, { tracingChannel: { h3: false, db0: true } }],
      });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toEqual({ ...ONLY_NUXT_CHANNELS, h3: true, db0: true });
    });

    it('keeps the value of Nuxt when only an extended layer sets the whole option to false', async () => {
      const nuxt = createMockNuxt({ layers: [{}, { tracingChannel: false }] });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toBe(false);
    });

    // As in Nuxt, the object of the app replaces the boolean of the layer.
    it('ignores the boolean of an extended layer when the app sets keys', async () => {
      const nuxt = createMockNuxt({ layers: [{ tracingChannel: { h3: true } }, { tracingChannel: false }] });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toEqual({ ...ONLY_NUXT_CHANNELS, h3: true });
    });

    it('reads a layer that has no config', async () => {
      const nuxt = createMockNuxt({ layers: [{}, null] });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toEqual(ONLY_NUXT_CHANNELS);
    });
  });

  describe('with the deprecated `nitro.tracingChannel` option', () => {
    it('keeps the keys that the app sets', async () => {
      const nuxt = createMockNuxt({ layers: [{ nitro: { tracingChannel: { unstorage: true } } }] });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toEqual({ ...ONLY_NUXT_CHANNELS, unstorage: true });
    });

    // Same order as in Nuxt.
    it('prefers its key over the same key of `tracingChannel`', async () => {
      const nuxt = createMockNuxt({
        layers: [{ tracingChannel: { h3: true, db0: true }, nitro: { tracingChannel: { h3: false } } }],
      });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toEqual({ ...ONLY_NUXT_CHANNELS, h3: false, db0: true });
    });

    it.each([
      { userValue: false, resolved: false },
      { userValue: true, resolved: {} },
    ])('keeps the value of Nuxt when the app sets the whole option to $userValue', async ({ userValue, resolved }) => {
      const nuxt = createMockNuxt({ layers: [{ nitro: { tracingChannel: userValue } }], resolved });

      await enableNuxtTracingChannels(nuxt, 'nitro3');

      expect(nuxt.options.tracingChannel).toBe(resolved);
    });
  });

  describe('Nuxt version', () => {
    it.each(['3.17.0', '4.5.0', '4.6.4'])('writes nothing on Nuxt %s', async version => {
      const nuxt = createMockNuxt({ version });

      await enableNuxtTracingChannels(nuxt, 'nitro2');

      expect(nuxt.options.tracingChannel).toBe(false);
    });

    it.each(['4.7.0', '4.10.2', '5.0.0-29384756.f4716665'])('writes the option on Nuxt %s', async version => {
      const nuxt = createMockNuxt({ version });

      await enableNuxtTracingChannels(nuxt, 'nitro2');

      expect(nuxt.options.tracingChannel).toEqual({ nuxt: true });
    });
  });
});
