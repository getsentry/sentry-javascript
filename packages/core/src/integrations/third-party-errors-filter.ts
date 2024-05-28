import type { Event, EventItem } from '@sentry/types';
import { forEachEnvelopeItem, getFramesFromEvent } from '@sentry/utils';
import { defineIntegration } from '../integration';
import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';

type Behaviour =
  | 'drop-if-some-frames-not-matched'
  | 'drop-if-every-frames-not-matched'
  | 'apply-tag-if-some-frames-not-matched'
  | 'apply-tag-if-every-frames-not-matched';

interface Options {
  /**
   * Keys that have been provided in the Sentry bundler plugin.
   */
  filterKeys: string[];

  /**
   * Defines how the integration should behave:
   *
   * - `drop-if-some-frames-not-matched`: Drops error events that contain stack frames that did not come from files marked with a matching bundle key.
   * - `drop-if-every-frames-not-matched`: Drops error events exclusively contain stack frames that did not come from files marked with a matching bundle key
   * - `apply-tag-if-some-frames-not-matched`: Keep events, but apply a `not-application-code: True` tag in case some frames did not come from user code.
   * - `apply-tag-if-every-frames-not-matched`: Keep events, but apply a `not-application-code: True` tag in case ale frames did not come from user code.
   */
  behaviour: Behaviour;
}

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

/**
 * This integration filters out errors that do not come from user code marked with a bundle key via the Sentry bundler plugins.
 */
export const thirdPartyErrorFilterIntegration = defineIntegration((options: Options) => {
  // Since the logic for out behaviours is inverted, we need to use the opposite array method.
  const arrayMethod = options.behaviour.match(/some/) ? 'every' : 'some';
  const shouldDrop = !!options.behaviour.match(/drop/);

  return {
    name: 'ThirdPartyErrorsFilter',
    setup(client) {
      // We need to strip metadata from stack frames before sending them to Sentry since these are client side only.
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
    processEvent(event, _, client) {
      const stackParser = client.getOptions().stackParser;
      addMetadataToStackFrames(stackParser, event);

      const frameKeys = getBundleKeysForAllFramesWithFilenames(event);

      if (frameKeys) {
        const match = frameKeys[arrayMethod](key => !options.filterKeys.includes(key));

        if (match) {
          if (shouldDrop) {
            return null;
          } else {
            event.tags = {
              ...event.tags,
              'not-application-code': true,
            };
          }
        }
      }

      return event;
    },
  };
});
