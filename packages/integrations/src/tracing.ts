import { EventProcessor, Hub, Integration } from '@sentry/types';
import { fill, getGlobalObject, isMatchingPattern, logger, supportsNativeFetch } from '@sentry/utils';

/** JSDoc */
interface TracingOptions {
  tracingOrigins?: Array<string | RegExp>;
  traceFetch?: boolean;
  traceXHR?: boolean;
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
            let isWhitelisted = self._options.tracingOrigins.some((origin: string | RegExp) =>
              isMatchingPattern(url, origin),
            );

            if (isMatchingPattern(url, 'sentry_key')) {
              // If sentry_key is in the url, it's an internal store request to sentry
              // we do not want to add the trace header to store requests
              isWhitelisted = false;
            }

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
        const hub = getCurrentHub();
        const self = hub.getIntegration(Tracing);
        if (self && self._options.tracingOrigins) {
          const url = args[0] as string;
          const options = (args[1] = (args[1] as { [key: string]: any }) || {});

          let isWhitelisted = false;
          self._options.tracingOrigins.forEach((whiteListUrl: string | RegExp) => {
            if (!isWhitelisted) {
              isWhitelisted = isMatchingPattern(url, whiteListUrl);
            }
          });

          if (isMatchingPattern(url, 'sentry_key')) {
            // If sentry_key is in the url, it's an internal store request to sentry
            // we do not want to add the trace header to store requests
            isWhitelisted = false;
          }

          if (isWhitelisted) {
            if (options.headers) {
              if (Array.isArray(options.headers)) {
                options.headers = [...options.headers, ...Object.entries(hub.traceHeaders())];
              } else {
                options.headers = {
                  ...options.headers,
                  ...hub.traceHeaders(),
                };
              }
            } else {
              options.headers = hub.traceHeaders();
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
