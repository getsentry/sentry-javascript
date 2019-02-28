import { captureException, captureMessage, getCurrentHub, Scope, withScope } from '@sentry/core';
import { Event, Integration } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { getGlobalObject } from '@sentry/utils/misc';

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
    this._Ember =
      options.Ember ||
      (getGlobalObject() as {
        Ember: any;
      }).Ember;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // tslint:disable:no-unsafe-any

    if (!this._Ember) {
      logger.error('EmberIntegration is missing an Ember instance');
      return;
    }

    const oldOnError = this._Ember.onerror;

    this._Ember.onerror = (error: Error): void => {
      if (getCurrentHub().getIntegration(Ember)) {
        withScope(scope => {
          this._addIntegrationToSdkInfo(scope);
          captureException(error);
        });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this._Ember, error);
      } else if (this._Ember.testing) {
        throw error;
      }
    };

    this._Ember.RSVP.on(
      'error',
      (reason: any): void => {
        if (getCurrentHub().getIntegration(Ember)) {
          withScope(scope => {
            if (reason instanceof Error) {
              scope.setExtra('context', 'Unhandled Promise error detected');
              this._addIntegrationToSdkInfo(scope);
              captureException(reason);
            } else {
              scope.setExtra('reason', reason);
              this._addIntegrationToSdkInfo(scope);
              captureMessage('Unhandled Promise error detected');
            }
          });
        }
      },
    );
  }

  /**
   * Appends SDK integrations
   * @param scope The scope currently used.
   */
  private _addIntegrationToSdkInfo(scope: Scope): void {
    scope.addEventProcessor((event: Event) => {
      if (event.sdk) {
        const integrations = event.sdk.integrations || [];
        event.sdk = {
          ...event.sdk,
          integrations: [...integrations, 'ember'],
        };
      }
      return event;
    });
  }
}
