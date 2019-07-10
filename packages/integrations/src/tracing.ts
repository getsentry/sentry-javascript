import { EventProcessor, Hub, Integration } from '@sentry/types';
import { fill, getGlobalObject, isMatchingPattern, logger, supportsNativeFetch } from '@sentry/utils';

/** JSDoc */
interface TracingOptions {
  tracingOrigins?: Array<string | RegExp>;
  traceFetch?: boolean;
  traceXHR?: boolean;
  autoStartOnDomReady?: boolean;
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
   * If we have an xhr we need to store the url in the instance.
   *
   */
  // @ts-ignore
  private _xhrUrl?: string;

  /**
   * Constructor for Tracing
   *
   * @param _options TracingOptions
   */
  public constructor(private readonly _options: TracingOptions = {}) {
    if (!Array.isArray(_options.tracingOrigins) || _options.tracingOrigins.length === 0) {
      const defaultTracingOrigins = ['localhost', /^\//];
      logger.warn(
        'Sentry: You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
      );
      logger.warn(`Sentry: We added a reasonable default for you: ${defaultTracingOrigins}`);
      _options.tracingOrigins = defaultTracingOrigins;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (this._options.traceXHR !== false) {
      this._traceXHR(getCurrentHub);
    }
    if (this._options.traceFetch !== false) {
      this._traceFetch(getCurrentHub);
    }
    if (this._options.autoStartOnDomReady !== false) {
      getGlobalObject<Window>().addEventListener('DOMContentLoaded', () => {
        Tracing.startTrace(getCurrentHub(), getGlobalObject<Window>().location.href);
      });
      getGlobalObject<Window>().document.onreadystatechange = () => {
        if (document.readyState === 'complete') {
          Tracing.startTrace(getCurrentHub(), getGlobalObject<Window>().location.href);
        }
      };
    }
  }

  /**
   * Starts a new trace
   * @param hub The hub to start the trace on
   * @param transaction Optional transaction
   */
  public static startTrace(hub: Hub, transaction?: string): void {
    hub.configureScope(scope => {
      // scope.startSpan();
      scope.setTransaction(transaction);
    });
  }

  /**
   * JSDoc
   */
  private _traceXHR(getCurrentHub: () => Hub): void {
    if (!('XMLHttpRequest' in getGlobalObject<Window>())) {
      return;
    }

    const xhrproto = XMLHttpRequest.prototype;

    fill(
      xhrproto,
      'open',
      originalOpen =>
        function(this: XMLHttpRequest, ...args: any[]): void {
          // @ts-ignore
          const self = getCurrentHub().getIntegration(Tracing);
          if (self) {
            self._xhrUrl = args[1] as string;
          }
          // tslint:disable-next-line: no-unsafe-any
          return originalOpen.apply(this, args);
        },
    );

    fill(
      xhrproto,
      'send',
      originalSend =>
        function(this: XMLHttpRequest, ...args: any[]): void {
          // @ts-ignore
          const self = getCurrentHub().getIntegration(Tracing);
          if (self && self._xhrUrl && self._options.tracingOrigins) {
            const url = self._xhrUrl;
            const headers = getCurrentHub().traceHeaders();
            // tslint:disable-next-line: prefer-for-of
            const isWhitelisted = self._options.tracingOrigins.some((origin: string | RegExp) =>
              isMatchingPattern(url, origin),
            );

            if (isWhitelisted && this.setRequestHeader) {
              Object.keys(headers).forEach(key => {
                this.setRequestHeader(key, headers[key]);
              });
            }
          }
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
        if (self && self._options.tracingOrigins) {
          const url = args[0] as string;
          const options = (args[1] = (args[1] as { [key: string]: any }) || {});

          let whiteListed = false;
          self._options.tracingOrigins.forEach((whiteListUrl: string | RegExp) => {
            if (!whiteListed) {
              whiteListed = isMatchingPattern(url, whiteListUrl);
            }
          });

          if (whiteListed) {
            if (options.headers) {
              if (Array.isArray(options.headers)) {
                options.headers = [...options.headers, ...Object.entries(getCurrentHub().traceHeaders())];
              } else {
                options.headers = {
                  ...options.headers,
                  ...getCurrentHub().traceHeaders(),
                };
              }
            } else {
              options.headers = getCurrentHub().traceHeaders();
            }
          }
        }
        // tslint:disable-next-line: no-unsafe-any
        return originalFetch.apply(getGlobalObject<Window>(), args);
      };
    });
    // tslint:enable: only-arrow-functions
  }
}
