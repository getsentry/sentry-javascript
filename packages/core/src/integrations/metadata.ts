import type { BaseTransportOptions, EventItem, EventProcessor, Hub, Integration, Transport } from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';

import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';
import type { RouteTo } from '../transports/multiplexed';
import { makeMultiplexedTransport } from '../transports/multiplexed';

/**
 * Adds module metadata to stack frames.
 *
 * Metadata can be injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 *
 * When this integration is added, the metadata passed to the bundler plugin is added to the stack frames of all events
 * under the `module_metadata` property. This can be used to help in tagging or routing of events from different teams
 * our sources
 */
export class ModuleMetadata implements Integration {
  /*
   * @inheritDoc
   */
  public static id: string = 'ModuleMetadata';

  /**
   * @inheritDoc
   */
  public name: string = ModuleMetadata.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (processor: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const client = getCurrentHub().getClient();

    if (!client || typeof client.on !== 'function') {
      return;
    }

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

    const stackParser = client.getOptions().stackParser;

    addGlobalEventProcessor(event => {
      addMetadataToStackFrames(stackParser, event);
      return event;
    });
  }
}

const ROUTE_TO_EXTRA_KEY = 'ROUTE_EVENT_TO';
type RouteToOptions = 'top-frame' | 'all-frames';

/**
 * This integration pulls module metadata from the stack frames and adds it to the event extra for later use by a
 * multiplexing transport.
 */
class ModuleMetadataToExtra implements Integration {
  /* @inheritDoc */
  public static id: string = 'ModuleMetadataToExtra';

  /** @inheritDoc */
  public name: string = ModuleMetadataToExtra.id;

  public constructor(private readonly _options: { routeTo: RouteToOptions } = { routeTo: 'top-frame' }) {}

  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(event => {
      if (
        event.exception &&
        event.exception.values &&
        event.exception.values[0].stacktrace &&
        event.exception.values[0].stacktrace.frames
      ) {
        const routeTo: RouteTo[] = [];

        // Reverse the stack frames so we can traverse from top to bottom
        const frames = [...event.exception.values[0].stacktrace.frames].reverse();

        for (const frame of frames) {
          if (frame.module_metadata && 'dsn' in frame.module_metadata) {
            routeTo.push(frame.module_metadata);
          }

          // If we are only interested in the top frame, break out!
          if (this._options.routeTo === 'top-frame') {
            break;
          }
        }

        if (routeTo.length) {
          event.extra = {
            ...event.extra,
            ROUTE_TO_EXTRA_KEY: routeTo,
          };
        }
      }

      return event;
    });
  }
}

/**
 * Routes events to different DSN/release depending on the module metadata for the error stack frames.
 */
export function routeViaModuleMetadata(
  createTransport: (options: BaseTransportOptions) => Transport,
  options: { routeTo: RouteToOptions } = { routeTo: 'top-frame' },
): {
  integrations: Integration[];
  transport: (transportOptions: BaseTransportOptions) => Transport;
} {
  const transport = makeMultiplexedTransport(createTransport, args => {
    const event = args.getEvent();

    if (event && event.extra && ROUTE_TO_EXTRA_KEY in event.extra) {
      return event.extra[ROUTE_TO_EXTRA_KEY] as RouteTo[];
    }

    return [];
  });

  return {
    integrations: [
      // This integration needs to be added first so it adds the metadata to the stack frames before we copy it to extra
      new ModuleMetadata(),
      new ModuleMetadataToExtra(options),
    ],
    transport,
  };
}
