import { getCurrentHub } from '@sentry/core';
import { addBreadcrumb, getIntegration } from '@sentry/hub';
import { Integration } from '@sentry/types';
import { fill, severityFromString } from '@sentry/utils';
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
    const sentryLevel = severityFromString(level);

    /* eslint-disable prefer-rest-params */
    return function(this: typeof console): void {
      if (getIntegration(getCurrentHub(), Console)) {
        addBreadcrumb(getCurrentHub(),
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
    /* eslint-enable prefer-rest-params */
  };
}
