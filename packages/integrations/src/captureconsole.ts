import type { EventProcessor, Hub, Integration } from '@sentry/types';
import { CONSOLE_LEVELS, fill, GLOBAL_OBJ, safeJoin, severityLevelFromString } from '@sentry/utils';

/** Send Console API calls as Sentry Events */
export class CaptureConsole implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'CaptureConsole';

  /**
   * @inheritDoc
   */
  public name: string = CaptureConsole.id;

  /**
   * @inheritDoc
   */
  private readonly _levels: readonly string[] = CONSOLE_LEVELS;

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
    if (!('console' in GLOBAL_OBJ)) {
      return;
    }

    this._levels.forEach((level: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      if (!(level in (GLOBAL_OBJ as any).console)) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      fill((GLOBAL_OBJ as any).console, level, (originalConsoleMethod: () => any) => (...args: any[]): void => {
        const hub = getCurrentHub();

        if (hub.getIntegration(CaptureConsole)) {
          hub.withScope(scope => {
            scope.setLevel(severityLevelFromString(level));
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
            } else if (level === 'error' && args[0] instanceof Error) {
              hub.captureException(args[0]);
            } else {
              hub.captureMessage(message);
            }
          });
        }

        // this fails for some browsers. :(
        if (originalConsoleMethod) {
          originalConsoleMethod.apply(GLOBAL_OBJ.console, args);
        }
      });
    });
  }
}
