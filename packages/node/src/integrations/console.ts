import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { fill, severityLevelFromString } from '@sentry/utils';
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
    const sentryLevel = severityLevelFromString(level);

    /* eslint-disable prefer-rest-params */
    return function (this: typeof console): void {
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
    /* eslint-enable prefer-rest-params */
  };
}
