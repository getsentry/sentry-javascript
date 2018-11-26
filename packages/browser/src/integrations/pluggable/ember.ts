import { captureException, captureMessage, getCurrentHub, Scope, withScope } from '@sentry/core';
import { Integration, SentryEvent } from '@sentry/types';
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
  public setupOnce(): void {
    if (!this.Ember) {
      return;
    }

    const oldOnError = this.Ember.onerror;

    this.Ember.onerror = (error: Error): void => {
      if (getCurrentHub().getIntegration(Ember)) {
        withScope(scope => {
          this.addIntegrationToSdkInfo(scope);
          captureException(error);
        });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this.Ember, error);
      } else if (this.Ember.testing) {
        throw error;
      }
    };

    this.Ember.RSVP.on(
      'error',
      (reason: any): void => {
        if (getCurrentHub().getIntegration(Ember)) {
          withScope(scope => {
            if (reason instanceof Error) {
              scope.setExtra('context', 'Unhandled Promise error detected');
              this.addIntegrationToSdkInfo(scope);
              captureException(reason);
            } else {
              scope.setExtra('reason', reason);
              this.addIntegrationToSdkInfo(scope);
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
  private addIntegrationToSdkInfo(scope: Scope): void {
    scope.addEventProcessor(async (event: SentryEvent) => {
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
