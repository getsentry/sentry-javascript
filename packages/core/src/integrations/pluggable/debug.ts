import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Integration, SentryEvent, SentryEventHint } from '@sentry/types';

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
  private readonly options: DebugOptions;

  /**
   * @inheritDoc
   */
  public constructor(options?: DebugOptions) {
    this.options = {
      debugger: false,
      stringify: false,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: SentryEvent, hint?: SentryEventHint) => {
      const self = getCurrentHub().getIntegration(Debug);
      if (self) {
        // tslint:disable:no-console
        // tslint:disable:no-debugger
        if (self.options.debugger) {
          debugger;
        }

        if (self.options.stringify) {
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
