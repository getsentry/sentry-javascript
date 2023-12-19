import * as util from 'util';
import { addBreadcrumb, getClient } from '@sentry/core';
import type { Client, Integration } from '@sentry/types';
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
    // noop
  }

  /** @inheritdoc */
  public setup(client: Client): void {
    addConsoleInstrumentationHandler(({ args, level }) => {
      if (getClient() !== client) {
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
