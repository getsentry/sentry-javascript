import {
  APIDetails,
  eventToSentryRequest,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
  initAPIDetails,
  sessionToSentryRequest,
} from '@sentry/core';
import {
  Event,
  Outcome,
  Response as SentryResponse,
  SentryRequest,
  SentryRequestType,
  Session,
  Transport,
  TransportOptions,
} from '@sentry/types';
import {
  dateTimestampInSeconds,
  dsnToString,
  eventStatusFromHttpCode,
  getGlobalObject,
  isDebugBuild,
  logger,
  makePromiseBuffer,
  parseRetryAfterHeader,
  PromiseBuffer,
} from '@sentry/utils';

import { sendReport } from './utils';

function requestTypeToCategory(ty: SentryRequestType): string {
  const tyStr = ty as string;
  return tyStr === 'event' ? 'error' : tyStr;
}

const global = getGlobalObject<Window>();

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * @deprecated
   */
  public url: string;

  /** Helper to get Sentry API endpoints. */
  protected readonly _api: APIDetails;

  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<SentryResponse> = makePromiseBuffer(30);

  /** Locks transport after receiving rate limits in a response */
  protected readonly _rateLimits: Record<string, Date> = {};

  protected _outcomes: { [key: string]: number } = {};

  public constructor(public options: TransportOptions) {
    this._api = initAPIDetails(options.dsn, options._metadata, options.tunnel);
    // eslint-disable-next-line deprecation/deprecation
    this.url = getStoreEndpointWithUrlEncodedAuth(this._api.dsn);

    if (this.options.sendClientReports && global.document) {
      global.document.addEventListener('visibilitychange', () => {
        if (global.document.visibilityState === 'hidden') {
          this._flushOutcomes();
        }
      });
    }
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<SentryResponse> {
    return this._sendRequest(eventToSentryRequest(event, this._api), event);
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: Session): PromiseLike<SentryResponse> {
    return this._sendRequest(sessionToSentryRequest(session, this._api), session);
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }

  /**
   * @inheritDoc
   */
  public recordLostEvent(reason: Outcome, category: SentryRequestType): void {
    if (!this.options.sendClientReports) {
      return;
    }
    // We want to track each category (event, transaction, session) separately
    // but still keep the distinction between different type of outcomes.
    // We could use nested maps, but it's much easier to read and type this way.
    // A correct type for map-based implementation if we want to go that route
    // would be `Partial<Record<SentryRequestType, Partial<Record<Outcome, number>>>>`
    const key = `${requestTypeToCategory(category)}:${reason}`;
    logger.log(`Adding outcome: ${key}`);
    this._outcomes[key] = (this._outcomes[key] ?? 0) + 1;
  }

  /**
   * Send outcomes as an envelope
   */
  protected _flushOutcomes(): void {
    if (!this.options.sendClientReports) {
      return;
    }

    const outcomes = this._outcomes;
    this._outcomes = {};

    // Nothing to send
    if (!Object.keys(outcomes).length) {
      logger.log('No outcomes to flush');
      return;
    }

    logger.log(`Flushing outcomes:\n${JSON.stringify(outcomes, null, 2)}`);

    const url = getEnvelopeEndpointWithUrlEncodedAuth(this._api.dsn, this._api.tunnel);
    // Envelope header is required to be at least an empty object
    const envelopeHeader = JSON.stringify({ ...(this._api.tunnel && { dsn: dsnToString(this._api.dsn) }) });
    const itemHeaders = JSON.stringify({
      type: 'client_report',
    });
    const item = JSON.stringify({
      timestamp: dateTimestampInSeconds(),
      discarded_events: Object.keys(outcomes).map(key => {
        const [category, reason] = key.split(':');
        return {
          reason,
          category,
          quantity: outcomes[key],
        };
      }),
    });
    const envelope = `${envelopeHeader}\n${itemHeaders}\n${item}`;

    try {
      sendReport(url, envelope);
    } catch (e) {
      logger.error(e);
    }
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
    const status = eventStatusFromHttpCode(response.status);
    /**
     * "The name is case-insensitive."
     * https://developer.mozilla.org/en-US/docs/Web/API/Headers/get
     */
    const limited = this._handleRateLimit(headers);
    if (limited && isDebugBuild()) {
      logger.warn(`Too many ${requestType} requests, backing off until: ${this._disabledUntil(requestType)}`);
    }

    if (status === 'success') {
      resolve({ status });
      return;
    }

    reject(response);
  }

  /**
   * Gets the time that given category is disabled until for rate limiting
   */
  protected _disabledUntil(requestType: SentryRequestType): Date {
    const category = requestTypeToCategory(requestType);
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

  protected abstract _sendRequest(
    sentryRequest: SentryRequest,
    originalPayload: Event | Session,
  ): PromiseLike<SentryResponse>;
}
