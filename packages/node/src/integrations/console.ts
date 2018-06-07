import { Integration } from '@sentry/types';
import { addBreadcrumb } from '@sentry/shim';
import { format } from 'util';
import { fill } from '@sentry/utils';
import { Severity } from '@sentry/types';

// TODO: Extend Console to allow for accessing [level], as it's not providing
// indexed access by default

/** Console module integration */
export class Console implements Integration {
  private originals: any[] = [];
  /**
   * @inheritDoc
   */
  public name: string = 'Console';
  /**
   * @inheritDoc
   */
  public install(): void {
    const Module = require('module');
    const self = this;

    function loadWrapper(origLoad: Function) {
      return function(moduleId: string) {
        const origModule = origLoad.apply(Module, arguments);

        if (moduleId !== 'console') return origModule;

        function consoleWrapper(level: string) {
          if (!(level in origModule)) {
            return;
          }

          function levelWrapper(originalConsoleLevel: Function) {
            let sentryLevel = Severity.Log;

            switch (level) {
              case 'debug':
                sentryLevel = Severity.Debug;
                break;
              case 'info':
                sentryLevel = Severity.Info;
                break;
              case 'warn':
                sentryLevel = Severity.Warning;
                break;
              case 'error':
                sentryLevel = Severity.Error;
                break;
            }

            return function() {
              var args = [].slice.call(arguments);

              addBreadcrumb({
                message: format.apply(null, args),
                level: sentryLevel,
                category: 'console',
              });

              originalConsoleLevel.apply(origModule, args);
            };
          }

          fill(origModule, level, levelWrapper, self.originals);
        }

        ['debug', 'info', 'warn', 'error', 'log'].forEach(consoleWrapper);

        return origModule;
      };
    }

    fill(Module, '_load', loadWrapper, self.originals);

    // special case: since console is built-in and app-level code won't require() it, do that here
    require('console');
  }
  /**
   * @inheritDoc
   */
  public uninstall(): void {
    if (!this.originals.length) return;
    let original;
    // eslint-disable-next-line no-cond-assign
    while ((original = this.originals.shift())) {
      const obj = original[0];
      const name = original[1];
      const orig = original[2];
      obj[name] = orig;
    }
  }
}
