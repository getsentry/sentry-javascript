import { configureScope } from '@sentry/minimal';
import { Integration, SentryEvent } from '@sentry/types';

/** JSDoc */
export class Debug implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Debug';

  /**
   * @inheritDoc
   */
  public install(): void {
    configureScope(scope => {
      scope.addEventProcessor(async (event: SentryEvent) => {
        // tslint:disable-next-line:no-console
        console.log(event);
        return event;
      });
    });
  }
}
