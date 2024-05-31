import type { Event, EventItem } from '@sentry/types';
import { forEachEnvelopeItem, getFramesFromEvent } from '@sentry/utils';
import { defineIntegration } from '../integration';
import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';

interface Options {
  /**
   * Keys that have been provided in the Sentry bundler plugin, identifying your bundles.
   */
  // TODO(lforst): Explain in JSDoc which option exactly needs to be set when we have figured out the API and deep link to the option in npm
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
    },
    processEvent(event, _hint, client) {
      const stackParser = client.getOptions().stackParser;
      addMetadataToStackFrames(stackParser, event);

      const frameKeys = getBundleKeysForAllFramesWithFilenames(event);

      if (frameKeys) {
        const arrayMethod =
          options.behaviour === 'drop-error-if-contains-third-party-frames' ||
          options.behaviour === 'apply-tag-if-contains-third-party-frames'
            ? 'some'
            : 'every';

        const behaviourApplies = frameKeys[arrayMethod](key => !options.filterKeys.includes(key));

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

function getBundleKeysForAllFramesWithFilenames(event: Event): string[] | undefined {
  const frames = getFramesFromEvent(event);

  if (!frames) {
    return undefined;
  }

  return (
    frames
      // Exclude frames without a filename since these are likely native code or built-ins
      .filter(frame => !!frame.filename)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .map(frame => (frame.module_metadata ? frame.module_metadata.bundle_key || '' : ''))
  );
}
