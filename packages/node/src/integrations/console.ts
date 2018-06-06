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

    fill(
      Module,
      '_load',
      function(origLoad: Function) {
        return function(moduleId: string) {
          const origModule = origLoad.apply(Module, arguments);

          if (moduleId !== 'console') return origModule;

          ['debug', 'info', 'warn', 'error', 'log'].forEach((level: string) => {
            if (!(level in origModule)) {
              return;
            }

            fill(
              origModule,
              level,
              function(originalConsoleLevel: Function) {
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
              },
              self.originals,
            );
          });

          return origModule;
        };
      },
      self.originals,
    );

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
