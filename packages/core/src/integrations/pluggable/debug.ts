import { getCurrentHub } from '@sentry/hub';
import { configureScope } from '@sentry/minimal';
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
  public name: string = 'Debug';

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
  public install(): void {
    if (getCurrentHub().getIntegration(this.name)) {
      configureScope(scope => {
        scope.addEventProcessor(async (event: SentryEvent, hint?: SentryEventHint) => {
          // tslint:disable:no-console
          // tslint:disable:no-debugger

          if (this.options.debugger) {
            debugger;
          }

          if (this.options.stringify) {
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
          return event;
        });
      });
    }
  }
}
