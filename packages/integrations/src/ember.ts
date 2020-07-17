import { EventProcessor, Hub, Integration } from '@sentry/types';
import { getGlobalObject, isInstanceOf, logger } from '@sentry/utils';

/** JSDoc */
export class Ember implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Ember.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'Ember';

  /**
   * @inheritDoc
   */
  private readonly _Ember: any; // tslint:disable-line:variable-name

  /**
   * @inheritDoc
   */
  public constructor(options: { Ember?: any } = {}) {
    // tslint:disable-next-line: no-unsafe-any
    this._Ember = options.Ember || getGlobalObject<any>().Ember;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // tslint:disable:no-unsafe-any

    if (!this._Ember) {
      logger.error('EmberIntegration is missing an Ember instance');
      return;
    }

    const oldOnError = this._Ember.onerror;

    this._Ember.onerror = (error: Error): void => {
      if (getCurrentHub().getIntegration(Ember)) {
        getCurrentHub().captureException(error, { originalException: error });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this._Ember, error);
      } else if (this._Ember.testing) {
        throw error;
      }
    };

    this._Ember.RSVP.on('error', (reason: any): void => {
      if (getCurrentHub().getIntegration(Ember)) {
        getCurrentHub().withScope(scope => {
          if (isInstanceOf(reason, Error)) {
            scope.setExtra('context', 'Unhandled Promise error detected');
            getCurrentHub().captureException(reason, { originalException: reason });
          } else {
            scope.setExtra('reason', reason);
            getCurrentHub().captureMessage('Unhandled Promise error detected');
          }
        });
      }
    });
  }
}
