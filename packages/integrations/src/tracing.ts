import { EventProcessor, Hub, Integration } from '@sentry/types';
import { fill, getGlobalObject, isMatchingPattern, supportsNativeFetch } from '@sentry/utils';

/** JSDoc */
interface TracingOptions {
  tracingOrigins: Array<string | RegExp>;
}

/**
 * Tracing Integration
 */
export class Tracing implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Tracing.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Tracing';

  /**
   * Constructor for Tracing
   *
   * @param _options TracingOptions
   */
  public constructor(private readonly _options: TracingOptions) {}

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (this._options.tracingOrigins.length) {
      this._traceXHR(getCurrentHub);
      this._traceFetch(getCurrentHub);
      getGlobalObject<Window>().addEventListener('DOMContentLoaded', () => {
        getCurrentHub().configureScope(scope => {
          const span = scope.startSpan();
          span.transaction = getGlobalObject<Window>().location.href;
        });
      });
    }
  }

  /**
   * JSDoc
   */
  private _traceXHR(getCurrentHub: () => Hub): void {
    if (!('XMLHttpRequest' in global)) {
      return;
    }

    const xhrproto = XMLHttpRequest.prototype;
    fill(
      xhrproto,
      'send',
      originalSend =>
        function(this: XMLHttpRequest, ...args: any[]): void {
          const headers = getCurrentHub().traceHeaders();
          Object.keys(headers).forEach(key => {
            this.setRequestHeader(key, headers[key]);
          });

          // tslint:disable-next-line: no-unsafe-any
          return originalSend.apply(this, args);
        },
    );
  }

  /**
   * JSDoc
   */
  private _traceFetch(getCurrentHub: () => Hub): void {
    if (!supportsNativeFetch()) {
      return;
    }

    // tslint:disable: only-arrow-functions
    fill(getGlobalObject<Window>(), 'fetch', function(originalFetch: () => void): () => void {
      return function(...args: any[]): void {
        // @ts-ignore
        const self = getCurrentHub().getIntegration(Tracing);
        if (self) {
          const url = args[0] as string;
          const options = args[1] as { [key: string]: any };

          let whiteListed = false;
          self._options.tracingOrigins.forEach((whiteListUrl: string) => {
            if (!whiteListed) {
              whiteListed = isMatchingPattern(url, whiteListUrl);
            }
          });

          if (options && whiteListed) {
            if (options.headers) {
              options.headers = {
                ...options.headers,
                ...getCurrentHub().traceHeaders(),
              };
            } else {
              options.headers = getCurrentHub().traceHeaders();
            }
          }
        }
        // tslint:disable-next-line: no-unsafe-any
        return originalFetch.apply(global, args);
      };
    });
    // tslint:enable: only-arrow-functions
  }
}
