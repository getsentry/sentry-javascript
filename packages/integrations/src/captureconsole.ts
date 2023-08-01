import type { EventProcessor, Hub, Integration } from '@sentry/types';
import type { ConsoleLevel } from '@sentry/utils';
import { CONSOLE_LEVELS, fill, GLOBAL_OBJ, safeJoin, severityLevelFromString } from '@sentry/utils';

interface CaptureConsoleOptions {
  /**
   * The console levels to be captured.
   */
  levels: Array<ConsoleLevel>;
  /**
   * A callback function that determines if console call should be captured as event.
   *
   * @param args Arguments
   * @returns A boolean indicating whether the call should be captured.
   */
  beforeCapture(level: ConsoleLevel, ...args: unknown[]): boolean;
}

const DEFAULT_BEFORE_CAPTURE = (): boolean => true;

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

  private readonly _levels = CONSOLE_LEVELS as unknown as CaptureConsoleOptions['levels'];
  private readonly _beforeCapture: CaptureConsoleOptions['beforeCapture'] = DEFAULT_BEFORE_CAPTURE;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<CaptureConsoleOptions> = {}) {
    if (options.levels) {
      this._levels = options.levels;
    }
    if (options.beforeCapture) {
      this._beforeCapture = options.beforeCapture;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!('console' in GLOBAL_OBJ)) {
      return;
    }

    this._levels.forEach(level => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      if (!(level in (GLOBAL_OBJ as any).console)) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      fill((GLOBAL_OBJ as any).console, level, (originalConsoleMethod: () => any) => (...args: any[]): void => {
        const hub = getCurrentHub();
        if (hub.getIntegration(CaptureConsole)) {
          hub.withScope(scope => {
            const shouldCapture = this._beforeCapture(level, ...args);
            if (!shouldCapture) {
              return;
            }

            scope.setLevel(severityLevelFromString(level));
            scope.setExtra('arguments', args);
            scope.addEventProcessor(event => {
              event.logger = 'console';
              return event;
            });

            const maybeError: Error | undefined = args.find(arg => arg instanceof Error);
            if (level === 'error' && maybeError) {
              hub.captureException(maybeError);
              return;
            }

            let message = safeJoin(args, ' ');
            if (level === 'assert' && !args[0]) {
              message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
              scope.setExtra('arguments', args.slice(1));
            }
            hub.captureMessage(message);
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
