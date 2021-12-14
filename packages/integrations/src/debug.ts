import { addGlobalEventProcessor, getHubAndIntegration } from '@sentry/hub';
import { Event, EventHint, Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

/** JSDoc */
interface DebugOptions {
  stringify?: boolean;
  debugger?: boolean;
}

/** JSDoc */
export class Debug implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Debug';

  /**
   * @inheritDoc
   */
  public name: string = Debug.id;

  /** JSDoc */
  private readonly _options: DebugOptions;

  /**
   * @inheritDoc
   */
  public constructor(options?: DebugOptions) {
    this._options = {
      debugger: false,
      stringify: false,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const [hub, self] = getHubAndIntegration(Debug);
      if (hub && self) {
        if (self._options.debugger) {
          // eslint-disable-next-line no-debugger
          debugger;
        }

        /* eslint-disable no-console */
        consoleSandbox(() => {
          if (self._options.stringify) {
            console.log(JSON.stringify(event, null, 2));
            if (hint) {
              console.log(JSON.stringify(hint, null, 2));
            }
          } else {
            console.log(event);
            if (hint) {
              console.log(hint);
            }
          }
        });
        /* eslint-enable no-console */
      }
      return event;
    });
  }
}
