import { getCurrentHub, Scope } from '@sentry/hub';
import { Integration } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';

/** JSDoc */
export class Ember implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Ember';

  /**
   * @inheritDoc
   */
  private readonly Ember: any; // tslint:disable-line:variable-name

  /**
   * @inheritDoc
   */
  public constructor(options: { Ember?: any } = {}) {
    this.Ember =
      options.Ember ||
      (getGlobalObject() as {
        Ember: any;
      }).Ember;
  }

  /**
   * @inheritDoc
   */
  public install(): void {
    if (!this.Ember) {
      return;
    }

    const oldOnError = this.Ember.onerror;

    this.Ember.onerror = (error: Error): void => {
      getCurrentHub().captureException(error, { originalException: error });

      if (typeof oldOnError === 'function') {
        oldOnError.call(this.Ember, error);
      }
    };

    this.Ember.RSVP.on(
      'error',
      (reason: any): void => {
        if (reason instanceof Error) {
          getCurrentHub().withScope(() => {
            getCurrentHub().configureScope((scope: Scope) => {
              scope.setExtra('context', 'Unhandled Promise error detected');
            });

            getCurrentHub().captureException(reason, { originalException: reason });
          });
        } else {
          getCurrentHub().withScope(() => {
            getCurrentHub().configureScope((scope: Scope) => {
              scope.setExtra('reason', reason);
            });

            getCurrentHub().captureMessage('Unhandled Promise error detected');
          });
        }
      },
    );
  }
}
