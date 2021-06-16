import { API } from '@sentry/core';
import {
  Event,
  Response as SentryResponse,
  SentryRequestType,
  Status,
  Transport,
  TransportOptions,
} from '@sentry/types';
import { logger, parseRetryAfterHeader, PromiseBuffer, SentryError } from '@sentry/utils';

const CATEGORY_MAPPING: {
  [key in SentryRequestType]: string;
} = {
  event: 'error',
  transaction: 'transaction',
  session: 'session',
  attachment: 'attachment',
};

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * @deprecated
   */
  public url: string;

  /** Helper to get Sentry API endpoints. */
  protected readonly _api: API;

  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<SentryResponse> = new PromiseBuffer(30);

  /** Locks transport after receiving rate limits in a response */
  protected readonly _rateLimits: Record<string, Date> = {};

  public constructor(public options: TransportOptions) {
    this._api = new API(options.dsn, options._metadata, options.tunnel);
    // eslint-disable-next-line deprecation/deprecation
    this.url = this._api.getStoreEndpointWithUrlEncodedAuth();
  }

  /**
   * @inheritDoc
   */
  public sendEvent(_: Event): PromiseLike<SentryResponse> {
    throw new SentryError('Transport Class has to implement `sendEvent` method');
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }

  /**
   * Handle Sentry repsonse for promise-based transports.
   */
  protected _handleResponse({
    requestType,
    response,
    headers,
    resolve,
    reject,
  }: {
    requestType: SentryRequestType;
    response: Response | XMLHttpRequest;
    headers: Record<string, string | null>;
    resolve: (value?: SentryResponse | PromiseLike<SentryResponse> | null | undefined) => void;
    reject: (reason?: unknown) => void;
  }): void {
    const status = Status.fromHttpCode(response.status);
    /**
     * "The name is case-insensitive."
     * https://developer.mozilla.org/en-US/docs/Web/API/Headers/get
     */
    const limited = this._handleRateLimit(headers);
    if (limited)
      logger.warn(`Too many ${requestType} requests, backing off until: ${this._disabledUntil(requestType)}`);

    if (status === Status.Success) {
      resolve({ status });
      return;
    }

    reject(response);
  }

  /**
   * Gets the time that given category is disabled until for rate limiting
   */
  protected _disabledUntil(requestType: SentryRequestType): Date {
    const category = CATEGORY_MAPPING[requestType];
    return this._rateLimits[category] || this._rateLimits.all;
  }

  /**
   * Checks if a category is rate limited
   */
  protected _isRateLimited(requestType: SentryRequestType): boolean {
    return this._disabledUntil(requestType) > new Date(Date.now());
  }

  /**
   * Sets internal _rateLimits from incoming headers. Returns true if headers contains a non-empty rate limiting header.
   */
  protected _handleRateLimit(headers: Record<string, string | null>): boolean {
    const now = Date.now();
    const rlHeader = headers['x-sentry-rate-limits'];
    const raHeader = headers['retry-after'];

    if (rlHeader) {
      // rate limit headers are of the form
      //     <header>,<header>,..
      // where each <header> is of the form
      //     <retry_after>: <categories>: <scope>: <reason_code>
      // where
      //     <retry_after> is a delay in ms
      //     <categories> is the event type(s) (error, transaction, etc) being rate limited and is of the form
      //         <category>;<category>;...
      //     <scope> is what's being limited (org, project, or key) - ignored by SDK
      //     <reason_code> is an arbitrary string like "org_quota" - ignored by SDK
      for (const limit of rlHeader.trim().split(',')) {
        const parameters = limit.split(':', 2);
        const headerDelay = parseInt(parameters[0], 10);
        const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1000; // 60sec default
        for (const category of parameters[1].split(';')) {
          this._rateLimits[category || 'all'] = new Date(now + delay);
        }
      }
      return true;
    } else if (raHeader) {
      this._rateLimits.all = new Date(now + parseRetryAfterHeader(now, raHeader));
      return true;
    }
    return false;
  }
}
