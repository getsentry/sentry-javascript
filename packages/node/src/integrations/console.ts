import { getCurrentHub } from '@sentry/core';
import { Integration, Severity } from '@sentry/types';
import { fill } from '@sentry/utils';
import * as util from 'util';

/** Console module integration */
export class Console implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Console';

  /**
   * @inheritDoc
   */
  public name: string = Console.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    for (const level of ['debug', 'info', 'warn', 'error', 'log']) {
      fill(console, level, createConsoleWrapper(level));
    }
  }
}

/**
 * Wrapper function that'll be used for every console level
 */
function createConsoleWrapper(level: string): (originalConsoleMethod: () => void) => void {
  return function consoleWrapper(originalConsoleMethod: () => void): () => void {
    let sentryLevel: Severity;

    switch (level) {
      case 'debug':
        sentryLevel = Severity.Debug;
        break;
      case 'error':
        sentryLevel = Severity.Error;
        break;
      case 'info':
        sentryLevel = Severity.Info;
        break;
      case 'warn':
        sentryLevel = Severity.Warning;
        break;
      default:
        sentryLevel = Severity.Log;
    }

    return function(this: typeof console): void {
      if (getCurrentHub().getIntegration(Console)) {
        getCurrentHub().addBreadcrumb(
          {
            category: 'console',
            level: sentryLevel,
            message: util.format.apply(undefined, arguments),
          },
          {
            input: [...arguments],
            level,
          },
        );
      }

      originalConsoleMethod.apply(this, arguments);
    };
  };
}
