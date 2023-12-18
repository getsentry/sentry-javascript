import { captureException, captureMessage, getClient, withScope } from '@sentry/core';
import type { CaptureContext, Client, EventProcessor, Hub, Integration } from '@sentry/types';
import {
  CONSOLE_LEVELS,
  GLOBAL_OBJ,
  addConsoleInstrumentationHandler,
  addExceptionMechanism,
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
  public setupOnce(_: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // noop
  }

  /** @inheritdoc */
  public client(client: Client): void {
    if (!('console' in GLOBAL_OBJ)) {
      return;
    }

    const levels = this._levels;

    addConsoleInstrumentationHandler(({ args, level }) => {
      if (getClient() !== client || !levels.includes(level)) {
        return;
      }

      consoleHandler(args, level);
    });
  }
}

function consoleHandler(args: unknown[], level: string): void {
  const captureContext: CaptureContext = {
    level: severityLevelFromString(level),
    extra: {
      arguments: args,
    },
  };

  withScope(scope => {
    scope.addEventProcessor(event => {
      event.logger = 'console';

      addExceptionMechanism(event, {
        handled: false,
        type: 'console',
      });

      return event;
    });

    if (level === 'assert' && args[0] === false) {
      const message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
      scope.setExtra('arguments', args.slice(1));
      captureMessage(message, captureContext);
      return;
    }

    const error = args.find(arg => arg instanceof Error);
    if (level === 'error' && error) {
      captureException(error, captureContext);
      return;
    }

    const message = safeJoin(args, ' ');
    captureMessage(message, captureContext);
  });
}
