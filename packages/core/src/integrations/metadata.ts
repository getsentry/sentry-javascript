import type {
  BaseTransportOptions,
  EventItem,
  EventProcessor,
  Hub,
  Integration,
  StackFrame,
  Transport,
} from '@sentry/types';
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

/**
 * This integration pulls module metadata from the stack frames and adds it to the event extra for later use by the
 * multiplex transport.
 */
class ModuleMetadataToExtra implements Integration {
  /* @inheritDoc */
  public static id: string = 'ModuleMetadataToExtra';

  /** @inheritDoc */
  public name: string = ModuleMetadataToExtra.id;

  public constructor(private readonly _callback: (frames: StackFrame[]) => RouteTo[]) {}

  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(event => {
      if (
        event.exception &&
        event.exception.values &&
        event.exception.values[0].stacktrace &&
        event.exception.values[0].stacktrace.frames
      ) {
        // Reverse the stack frames so we can traverse from top to bottom
        const frames = [...event.exception.values[0].stacktrace.frames].reverse();
        const routeTo = this._callback(frames);

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
 *
 * The callback function is called with the stack frames from the error and you should return an array of
 * `{ dsn: string, release?: string }` objects to send this event to. If you return an empty array, the event will be
 * sent to the dsn specified in the init options.
 */
export function routeViaModuleMetadata(
  callback: (frames: StackFrame[]) => RouteTo[],
  createTransport: (options: BaseTransportOptions) => Transport,
): {
  integrations: Integration[];
  transport: (transportOptions: BaseTransportOptions) => Transport;
} {
  const transport = makeMultiplexedTransport(createTransport, args => {
    const event = args.getEvent();

    if (event && event.extra && ROUTE_TO_EXTRA_KEY in event.extra && Array.isArray(event.extra[ROUTE_TO_EXTRA_KEY])) {
      return event.extra[ROUTE_TO_EXTRA_KEY] as RouteTo[];
    }

    return [];
  });

  return {
    integrations: [
      // This integration needs to be added first so it adds the metadata to the stack frames before we copy it to extra
      new ModuleMetadata(),
      new ModuleMetadataToExtra(callback),
    ],
    transport,
  };
}
