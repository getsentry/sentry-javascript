import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
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
  private readonly _angular: ng.IAngularStatic;

  /**
   * Returns current hub.
   */
  private _getCurrentHub?: () => Hub;

  /**
   * @inheritDoc
   */
  public constructor(options: { angular?: ng.IAngularStatic } = {}) {
    this._angular =
      options.angular ||
      (getGlobalObject() as {
        angular: ng.IAngularStatic;
      }).angular;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._angular) {
      console.error('AngularIntegration is missing an Angular instance');
      return;
    }

    this._getCurrentHub = getCurrentHub;

    this._angular.module(Angular.moduleName, []).config([
      '$provide',
      ($provide: ng.auto.IProvideService) => {
        $provide.decorator('$exceptionHandler', ['$delegate', this._$exceptionHandlerDecorator.bind(this)]);
      },
    ]);
  }

  /**
   * Angular's exceptionHandler for Sentry integration
   */
  private _$exceptionHandlerDecorator($delegate: ng.IExceptionHandlerService): ng.IExceptionHandlerService {
    return (exception: Error, cause?: string) => {
      const hub = this._getCurrentHub && this._getCurrentHub();

      if (hub && hub.getIntegration(Angular)) {
        hub.withScope(scope => {
          if (cause) {
            scope.setExtra('cause', cause);
          }

          scope.addEventProcessor((event: Event) => {
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

          hub.captureException(exception);
        });
      }
      $delegate(exception, cause);
    };
  }
}
