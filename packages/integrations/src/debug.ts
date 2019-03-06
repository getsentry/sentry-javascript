import { Event, EventHint, EventProcessor, Hub, Integration } from '@sentry/types';

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
  public name: string = Debug.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Debug';

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
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(Debug);
      if (self) {
        // tslint:disable:no-console
        // tslint:disable:no-debugger
        if (self._options.debugger) {
          debugger;
        }

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
      }
      return event;
    });
  }
}
