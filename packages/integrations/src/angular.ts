import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { getGlobalObject, logger } from '@sentry/utils';

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
  public static id: string = 'AngularJS';

  /**
   * moduleName used in Angular's DI resolution algorithm
   */
  public static moduleName: string = 'ngSentry';

  /**
   * @inheritDoc
   */
  public name: string = Angular.id;

  /**
   * Angular's instance
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _angular: any;

  /**
   * ngSentry module instance
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _module: any;

  /**
   * Returns current hub.
   */
  private _getCurrentHub?: () => Hub;

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(options: { angular?: any } = {}) {
    logger.log('You are still using the Angular integration, consider moving to @sentry/angular');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    this._angular = options.angular || getGlobalObject<any>().angular;

    if (!this._angular) {
      logger.error('AngularIntegration is missing an Angular instance');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this._module = this._angular.module(Angular.moduleName, []);
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._module) {
      return;
    }

    this._getCurrentHub = getCurrentHub;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this._module.config([
      '$provide',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ($provide: any): void => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        $provide.decorator('$exceptionHandler', ['$delegate', this._$exceptionHandlerDecorator.bind(this)]);
      },
    ]);
  }

  /**
   * Angular's exceptionHandler for Sentry integration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _$exceptionHandlerDecorator($delegate: any): any {
    return (exception: Error, cause?: string): void => {
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
