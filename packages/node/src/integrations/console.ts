import { addBreadcrumb } from '@sentry/shim';
import { Integration, Severity } from '@sentry/types';
import { fill } from '@sentry/utils';
import { format } from 'util';

// TODO: Extend Console to allow for accessing [level], as it's not providing
// indexed access by default

/** Console module integration */
export class Console implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Console';
  /**
   * @inheritDoc
   */
  public install(): void {
    const MODULE = require('module');

    /**
     * Wrapper function for internal _load calls within `require`
     */
    function loadWrapper(origLoad: () => any): any {
      return function(moduleId: string): any {
        const origModule = origLoad.apply(MODULE, arguments);

        if (moduleId !== 'console') {
          return origModule;
        }

        /**
         * Wrapper function that'll be used for every console level
         */
        function consoleWrapper(level: string): any {
          if (!(level in origModule)) {
            return;
          }

          /**
           * Internal wrapper function for console calls
           */
          function levelWrapper(originalConsoleLevel: () => any): any {
            let sentryLevel: Severity;

            switch (level) {
              case 'debug':
                sentryLevel = Severity.Debug;
                break;
              case 'error':
                sentryLevel = Severity.Error;
                break;
              case 'info':
                sentryLevel = Severity.Info;
                break;
              case 'warn':
                sentryLevel = Severity.Warning;
                break;
              default:
                sentryLevel = Severity.Log;
            }

            return function(): any {
              addBreadcrumb({
                category: 'console',
                level: sentryLevel,
                message: format.apply(undefined, arguments),
              });

              originalConsoleLevel.apply(origModule, arguments);
            };
          }

          fill(origModule, level, levelWrapper);
        }

        ['debug', 'info', 'warn', 'error', 'log'].forEach(consoleWrapper);

        return origModule;
      };
    }

    fill(MODULE, '_load', loadWrapper);

    // special case: since console is built-in and app-level code won't require() it, do that here
    require('console');
  }
}
