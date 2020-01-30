import { EventProcessor, Hub, Integration, Severity } from '@sentry/types';
import { fill, getGlobalObject, safeJoin } from '@sentry/utils';

const global = getGlobalObject<Window | NodeJS.Global>();

/** Send Console API calls as Sentry Events */
export class CaptureConsole implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = CaptureConsole.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'CaptureConsole';

  /**
   * @inheritDoc
   */
  private readonly _levels: string[] = ['log', 'info', 'warn', 'error', 'debug', 'assert'];

  /**
   * @inheritDoc
   */
  public constructor(options: { levels?: string[] } = {}) {
    if (options.levels) {
      this._levels = options.levels;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!('console' in global)) {
      return;
    }

    this._levels.forEach((level: string) => {
      if (!(level in global.console)) {
        return;
      }

      fill(global.console, level, (originalConsoleLevel: () => any) => (...args: any[]) => {
        const hub = getCurrentHub();

        if (hub.getIntegration(CaptureConsole)) {
          hub.withScope(scope => {
            scope.setLevel(Severity.fromString(level));
            scope.setExtra('arguments', args);
            scope.addEventProcessor(event => {
              event.logger = 'console';
              return event;
            });

            let message = safeJoin(args, ' ');
            if (level === 'assert') {
              if (args[0] === false) {
                message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
                scope.setExtra('arguments', args.slice(1));
                hub.captureMessage(message);
              }
            } else {
              hub.captureMessage(message);
            }
          });
        }

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
          Function.prototype.apply.call(originalConsoleLevel, global.console, args);
        }
      });
    });
  }
}
