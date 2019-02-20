import { captureException, getCurrentHub, withScope } from '@sentry/core';
import { Event, Integration } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { getGlobalObject } from '@sentry/utils/misc';

// See https://github.com/angular/angular.js/blob/v1.4.7/src/minErr.js
const angularPattern = /^\[((?:[$a-zA-Z0-9]+:)?(?:[$a-zA-Z0-9]+))\] (.*?)\n?(\S+)$/;

/**
 * AngularJS integration
 *
 * Provides an $exceptionHandler for AngularJS
 */
export class Angular implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Angular.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'AngularJS';

  /**
   * moduleName used in Angular's DI resolution algorithm
   */
  public static moduleName: string = 'ngSentry';

  /**
   * Angular's instance
   */
  private readonly angular: ng.IAngularStatic;

  /**
   * @inheritDoc
   */
  public constructor(options: { angular?: ng.IAngularStatic } = {}) {
    this.angular =
      options.angular ||
      (getGlobalObject() as {
        angular: ng.IAngularStatic;
      }).angular;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    if (!this.angular) {
      logger.error('AngularIntegration is missing an Angular instance');
      return;
    }

    this.angular.module(Angular.moduleName, []).config([
      '$provide',
      ($provide: ng.auto.IProvideService) => {
        $provide.decorator('$exceptionHandler', ['$delegate', this.$exceptionHandlerDecorator.bind(this)]);
      },
    ]);
  }

  /**
   * Angular's exceptionHandler for Sentry integration
   */
  private $exceptionHandlerDecorator($delegate: ng.IExceptionHandlerService): ng.IExceptionHandlerService {
    return (exception, cause) => {
      if (getCurrentHub().getIntegration(Angular)) {
        withScope(scope => {
          if (cause) {
            scope.setExtra('cause', cause);
          }

          scope.addEventProcessor(event => {
            const ex = event.exception && event.exception.values && event.exception.values[0];

            if (ex) {
              const matches = angularPattern.exec(ex.value || '');

              if (matches) {
                // This type now becomes something like: $rootScope:inprog
                ex.type = matches[1];
                ex.value = matches[2];
                event.message = `${ex.type}: ${ex.value}`;
                // auto set a new tag specifically for the angular error url
                event.extra = {
                  ...event.extra,
                  angularDocs: matches[3].substr(0, 250),
                };
              }
            }

            return event;
          });

          captureException(exception);
        });
      }
      $delegate(exception, cause);
    };
  }
}
