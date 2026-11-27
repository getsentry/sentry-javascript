import { hasNuxtCompatibility } from '@nuxt/kit';
import type { Nuxt, NuxtConfig } from '@nuxt/schema';
import type { ServerApi } from './utils';

type TracingChannelValue = NuxtConfig['tracingChannel'];

// The SDK's own instrumentation makes these spans. It also works on Nitro v2, which has no channels.
const NITRO_CHANNEL_GROUPS_OFF = { srvx: false, h3: false, unstorage: false, db0: false };

/**
 * Turns on the `nuxt.*` tracing channels for `nuxtTracingChannelIntegration`.
 * A `tracingChannel` value in the Nuxt config of the app wins.
 */
export async function enableNuxtTracingChannels(nuxt: Nuxt, serverApi: ServerApi): Promise<void> {
  // The option exists since Nuxt 4.5, but the `nuxt.request` channel came in 4.7.
  if (!(await hasNuxtCompatibility({ nuxt: '>=4.7.0' }, nuxt))) {
    return;
  }

  // The resolved option is `false` for both "not set" and `false`. Only the raw layer config tells them apart.
  const layerConfigs = nuxt.options._layers.map(layer => layer.config);
  const userValue = mergeLayerValues(layerConfigs.map(config => config?.tracingChannel));
  // oxlint-disable-next-line typescript/no-deprecated -- Nuxt still reads it
  const deprecatedUserValue = mergeLayerValues(layerConfigs.map(config => config?.nitro?.tracingChannel));

  if (typeof userValue === 'boolean' || typeof deprecatedUserValue === 'boolean') {
    return;
  }

  // Another module or a CLI override set the option. Keep that value.
  if (!userValue && !deprecatedUserValue && nuxt.options.tracingChannel) {
    return;
  }

  nuxt.options.tracingChannel = {
    nuxt: true,
    // Only Nitro v3 has these groups.
    ...(serverApi === 'nitro3' && NITRO_CHANNEL_GROUPS_OFF),
    ...userValue,
    ...deprecatedUserValue,
  };
}

/** Merges the layer values as Nuxt does. The first layer that sets a key wins, and the app is the first layer. */
function mergeLayerValues(values: TracingChannelValue[]): TracingChannelValue {
  return values.reduce((merged, value) => {
    if (typeof merged === 'object' && typeof value === 'object') {
      return { ...value, ...merged };
    }

    return merged ?? value;
  }, undefined);
}
