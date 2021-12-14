import { Integration } from '@sentry/types';
import { getGlobalObject, isInstanceOf, logger } from '@sentry/utils';
import { getHubAndIntegration } from '@sentry/hub';

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
  public setupOnce(): void {
    if (!this._Ember) {
      logger.error('EmberIntegration is missing an Ember instance');
      return;
    }

    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    const oldOnError = this._Ember.onerror;

    this._Ember.onerror = (error: Error): void => {
      const [hub, integration] = getHubAndIntegration(Ember);
      if (hub && integration) {
        hub.captureException(error, { originalException: error });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this._Ember, error);
      } else if (this._Ember.testing) {
        throw error;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._Ember.RSVP.on('error', (reason: unknown): void => {
      const [hub, integration] = getHubAndIntegration(Ember);
      if (hub && integration) {
        hub.withScope(scope => {
          if (isInstanceOf(reason, Error)) {
            scope.setExtra('context', 'Unhandled Promise error detected');
            hub.captureException(reason, { originalException: reason as Error });
          } else {
            scope.setExtra('reason', reason);
            hub.captureMessage('Unhandled Promise error detected');
          }
        });
      }
    });
  }
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}
