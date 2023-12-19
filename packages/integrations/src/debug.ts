import type { Client, Event, EventHint, EventProcessor, Hub, Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

interface DebugOptions {
  /** Controls whether console output created by this integration should be stringified. Default: `false` */
  stringify?: boolean;
  /** Controls whether a debugger should be launched before an event is sent. Default: `false` */
  debugger?: boolean;
}

/**
 * Integration to debug sent Sentry events.
 * This integration should not be used in production
 */
export class Debug implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Debug';

  /**
   * @inheritDoc
   */
  public name: string;

  private readonly _options: DebugOptions;

  public constructor(options?: DebugOptions) {
    this.name = Debug.id;

    this._options = {
      debugger: false,
      stringify: false,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(
    _addGlobalEventProcessor: (eventProcessor: EventProcessor) => void,
    _getCurrentHub: () => Hub,
  ): void {
    // noop
  }

  /** @inheritdoc */
  public setup(client: Client): void {
    if (!client.on) {
      return;
    }

    client.on('beforeSendEvent', (event: Event, hint?: EventHint) => {
      if (this._options.debugger) {
        // eslint-disable-next-line no-debugger
        debugger;
      }

      /* eslint-disable no-console */
      consoleSandbox(() => {
        if (this._options.stringify) {
          console.log(JSON.stringify(event, null, 2));
          if (hint && Object.keys(hint).length) {
            console.log(JSON.stringify(hint, null, 2));
          }
        } else {
          console.log(event);
          if (hint && Object.keys(hint).length) {
            console.log(hint);
          }
        }
      });
      /* eslint-enable no-console */
    });
  }
}
