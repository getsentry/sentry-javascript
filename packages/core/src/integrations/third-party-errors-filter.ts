import { defineIntegration } from '../integration';
import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';
import type { EventItem } from '../types-hoist/envelope';
import type { Event } from '../types-hoist/event';
import { forEachEnvelopeItem } from '../utils/envelope';
import { getFramesFromEvent } from '../utils/stacktrace';

interface Options {
  /**
   * Keys that have been provided in the Sentry bundler plugin via the the `applicationKey` option, identifying your bundles.
   *
   * - Webpack plugin: https://www.npmjs.com/package/@sentry/webpack-plugin#applicationkey
   * - Vite plugin: https://www.npmjs.com/package/@sentry/vite-plugin#applicationkey
   * - Esbuild plugin: https://www.npmjs.com/package/@sentry/esbuild-plugin#applicationkey
   * - Rollup plugin: https://www.npmjs.com/package/@sentry/rollup-plugin#applicationkey
   */
  filterKeys: string[];

  /**
   * Defines how the integration should behave. "Third-Party Stack Frames" are stack frames that did not come from files marked with a matching bundle key.
   *
   * You can define the behaviour with one of 4 modes:
   * - `drop-error-if-contains-third-party-frames`: Drop error events that contain at least one third-party stack frame.
   * - `drop-error-if-exclusively-contains-third-party-frames`: Drop error events that exclusively contain third-party stack frames.
   * - `apply-tag-if-contains-third-party-frames`: Keep all error events, but apply a `third_party_code: true` tag in case the error contains at least one third-party stack frame.
   * - `apply-tag-if-exclusively-contains-third-party-frames`: Keep all error events, but apply a `third_party_code: true` tag in case the error contains exclusively third-party stack frames.
   *
   * If you chose the mode to only apply tags, the tags can then be used in Sentry to filter your issue stream by entering `!third_party_code:True` in the search bar.
   */
  behaviour:
    | 'drop-error-if-contains-third-party-frames'
    | 'drop-error-if-exclusively-contains-third-party-frames'
    | 'apply-tag-if-contains-third-party-frames'
    | 'apply-tag-if-exclusively-contains-third-party-frames';
}

/**
 * This integration allows you to filter out, or tag error events that do not come from user code marked with a bundle key via the Sentry bundler plugins.
 */
export const thirdPartyErrorFilterIntegration = defineIntegration((options: Options) => {
  return {
    name: 'ThirdPartyErrorsFilter',
    setup(client) {
      // We need to strip metadata from stack frames before sending them to Sentry since these are client side only.
      // TODO(lforst): Move this cleanup logic into a more central place in the SDK.
      client.on('beforeEnvelope', envelope => {
        forEachEnvelopeItem(envelope, (item, type) => {
          if (type === 'event') {
            const event = Array.isArray(item) ? (item as EventItem)[1] : undefined;

            if (event) {
              stripMetadataFromStackFrames(event);
              item[1] = event;
            }
          }
        });
      });

      client.on('applyFrameMetadata', event => {
        // Only apply stack frame metadata to error events
        if (event.type) {
          return;
        }

        const stackParser = client.getOptions().stackParser;
        addMetadataToStackFrames(stackParser, event);
      });
    },

    processEvent(event) {
      const frameKeys = getBundleKeysForAllFramesWithFilenames(event);

      if (frameKeys) {
        const arrayMethod =
          options.behaviour === 'drop-error-if-contains-third-party-frames' ||
          options.behaviour === 'apply-tag-if-contains-third-party-frames'
            ? 'some'
            : 'every';

        const behaviourApplies = frameKeys[arrayMethod](keys => !keys.some(key => options.filterKeys.includes(key)));

        if (behaviourApplies) {
          const shouldDrop =
            options.behaviour === 'drop-error-if-contains-third-party-frames' ||
            options.behaviour === 'drop-error-if-exclusively-contains-third-party-frames';
          if (shouldDrop) {
            return null;
          } else {
            event.tags = {
              ...event.tags,
              third_party_code: true,
            };
          }
        }
      }

      return event;
    },
  };
});

function getBundleKeysForAllFramesWithFilenames(event: Event): string[][] | undefined {
  const frames = getFramesFromEvent(event);

  if (!frames) {
    return undefined;
  }

  return (
    frames
      // Exclude frames without a filename since these are likely native code or built-ins
      .filter(frame => !!frame.filename)
      .map(frame => {
        if (frame.module_metadata) {
          return Object.keys(frame.module_metadata)
            .filter(key => key.startsWith(BUNDLER_PLUGIN_APP_KEY_PREFIX))
            .map(key => key.slice(BUNDLER_PLUGIN_APP_KEY_PREFIX.length));
        }
        return [];
      })
  );
}

const BUNDLER_PLUGIN_APP_KEY_PREFIX = '_sentryBundlerPluginAppKey:';
