import type { EventProcessor, Hub, Integration } from '@sentry/types';
import {
  addInstrumentationHandler,
  CONSOLE_LEVELS,
  GLOBAL_OBJ,
  safeJoin,
  severityLevelFromString,
} from '@sentry/utils';

/** Send Console API calls as Sentry Events */
export class CaptureConsole implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'CaptureConsole';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * @inheritDoc
   */
  private readonly _levels: readonly string[];

  /**
   * @inheritDoc
   */
  public constructor(options: { levels?: string[] } = {}) {
    this.name = CaptureConsole.id;
    this._levels = options.levels || CONSOLE_LEVELS;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!('console' in GLOBAL_OBJ)) {
      return;
    }

    const levels = this._levels;

    addInstrumentationHandler('console', ({ args, level }: { args: unknown[]; level: string }) => {
      if (!levels.includes(level)) {
        return;
      }

      const hub = getCurrentHub();

      if (!hub.getIntegration(CaptureConsole)) {
        return;
      }

      consoleHandler(hub, args, level);
    });
  }
}

function consoleHandler(hub: Hub, args: unknown[], level: string): void {
  hub.withScope(scope => {
    scope.setLevel(severityLevelFromString(level));
    scope.setExtra('arguments', args);
    scope.addEventProcessor(event => {
      event.logger = 'console';
      return event;
    });

    let message = safeJoin(args, ' ');
    const error = args.find(arg => arg instanceof Error);
    if (level === 'assert') {
      if (args[0] === false) {
        message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
        scope.setExtra('arguments', args.slice(1));
        hub.captureMessage(message);
      }
    } else if (level === 'error' && error) {
      hub.captureException(error);
    } else {
      hub.captureMessage(message);
    }
  });
}
