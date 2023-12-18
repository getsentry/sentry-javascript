import * as util from 'util';
import { addBreadcrumb, getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { addConsoleInstrumentationHandler, severityLevelFromString } from '@sentry/utils';

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
    addConsoleInstrumentationHandler(({ args, level }) => {
      const hub = getCurrentHub();

      if (!hub.getIntegration(Console)) {
        return;
      }

      addBreadcrumb(
        {
          category: 'console',
          level: severityLevelFromString(level),
          message: util.format.apply(undefined, args),
        },
        {
          input: [...args],
          level,
        },
      );
    });
  }
}
