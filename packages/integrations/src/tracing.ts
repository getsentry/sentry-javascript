import { Integration } from '@sentry/types';
import { fill, getGlobalObject, supportsNativeFetch, uuid4 } from '@sentry/utils';

/**
 * Session Tracking Integration
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
   * Constructor for OpenTracingIntegration
   *
   * @param traceId Optional TraceId that should be set into the integration.
   */
  public constructor(private readonly _traceId: string = uuid4()) {}

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._traceXHR();
    this._traceFetch();
  }

  /**
   * JSDoc
   */
  private _traceXHR(): void {
    if (!('XMLHttpRequest' in global)) {
      return;
    }

    const traceId = this._traceId;

    const xhrproto = XMLHttpRequest.prototype;
    fill(
      xhrproto,
      'send',
      originalSend =>
        function(this: XMLHttpRequest, ...args: any[]): void {
          this.setRequestHeader('sentry-trace', traceId);
          // tslint:disable-next-line: no-unsafe-any
          return originalSend.apply(this, args);
        },
    );
  }

  /**
   * JSDoc
   */
  private _traceFetch(): void {
    if (!supportsNativeFetch()) {
      return;
    }

    const traceId = this._traceId;

    // tslint:disable: only-arrow-functions
    fill(getGlobalObject<Window>(), 'fetch', function(originalFetch: () => void): () => void {
      return function(...args: any[]): void {
        const options = args[1] as { [key: string]: any };
        if (options) {
          if (options.headers) {
            options.headers = {
              ...options.headers,
              'sentry-trace': traceId,
            };
          } else {
            options.headers = {
              'sentry-trace': traceId,
            };
          }
        }
        // tslint:disable-next-line: no-unsafe-any
        return originalFetch.apply(global, args);
      };
    });
    // tslint:enable: only-arrow-functions

    // fill(
    //   getGlobalObject<Window>(),
    //   'fetch',
    //   originalFetch =>
    //     function(...args: any[]): void {
    //       console.log(args);
    //       // tslint:disable-next-line: no-unsafe-any
    //       return originalFetch.apply(this, args);
    //     },
    // );
  }
}
