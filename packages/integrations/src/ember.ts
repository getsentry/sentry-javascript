import {
  captureHubException,
  captureHubMessage,
  getHubIntegration,
  Hub,
  setScopeExtra,
  withHubScope,
} from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { getGlobalObject, isInstanceOf, logger } from '@sentry/utils';

/** JSDoc */
export class Ember implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Ember';

  /**
   * @inheritDoc
   */
  public name: string = Ember.id;

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any
  private readonly _Ember: any;

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(options: { Ember?: any } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    this._Ember = options.Ember || getGlobalObject<any>().Ember;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._Ember) {
      logger.error('EmberIntegration is missing an Ember instance');
      return;
    }

    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    const oldOnError = this._Ember.onerror;

    this._Ember.onerror = (error: Error): void => {
      if (getHubIntegration(getCurrentHub(), Ember)) {
        captureHubException(getCurrentHub(), error, { originalException: error });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this._Ember, error);
      } else if (this._Ember.testing) {
        throw error;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._Ember.RSVP.on('error', (reason: unknown): void => {
      if (getHubIntegration(getCurrentHub(), Ember)) {
        withHubScope(getCurrentHub(), scope => {
          if (isInstanceOf(reason, Error)) {
            setScopeExtra(scope, 'context', 'Unhandled Promise error detected');
            captureHubException(getCurrentHub(), reason, { originalException: reason as Error });
          } else {
            setScopeExtra(scope, 'reason', reason);
            captureHubMessage(getCurrentHub(), 'Unhandled Promise error detected');
          }
        });
      }
    });
  }

  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}
