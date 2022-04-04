import {
  APIDetails,
  eventToSentryRequest,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
  initAPIDetails,
  sessionToSentryRequest,
} from '@sentry/core';
import {
  ClientReport,
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
  createClientReportEnvelope,
  disabledUntil,
  dsnToString,
  eventStatusFromHttpCode,
  getGlobalObject,
  isRateLimited,
  logger,
  makePromiseBuffer,
  PromiseBuffer,
  RateLimits,
  serializeEnvelope,
  updateRateLimits,
} from '@sentry/utils';

import { IS_DEBUG_BUILD } from '../flags';
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
  protected _rateLimits: RateLimits = {};

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
    IS_DEBUG_BUILD && logger.log(`Adding outcome: ${key}`);
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
      IS_DEBUG_BUILD && logger.log('No outcomes to flush');
      return;
    }

    IS_DEBUG_BUILD && logger.log(`Flushing outcomes:\n${JSON.stringify(outcomes, null, 2)}`);

    const url = getEnvelopeEndpointWithUrlEncodedAuth(this._api.dsn, this._api.tunnel);

    const discardedEvents = Object.keys(outcomes).map(key => {
      const [category, reason] = key.split(':');
      return {
        reason,
        category,
        quantity: outcomes[key],
      };
      // TODO: Improve types on discarded_events to get rid of cast
    }) as ClientReport['discarded_events'];
    const envelope = createClientReportEnvelope(discardedEvents, this._api.tunnel && dsnToString(this._api.dsn));

    try {
      sendReport(url, serializeEnvelope(envelope));
    } catch (e) {
      IS_DEBUG_BUILD && logger.error(e);
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

    this._rateLimits = updateRateLimits(this._rateLimits, headers);
    // eslint-disable-next-line deprecation/deprecation
    if (this._isRateLimited(requestType)) {
      IS_DEBUG_BUILD &&
        // eslint-disable-next-line deprecation/deprecation
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
   *
   * @deprecated Please use `disabledUntil` from @sentry/utils
   */
  protected _disabledUntil(requestType: SentryRequestType): Date {
    const category = requestTypeToCategory(requestType);
    return new Date(disabledUntil(this._rateLimits, category));
  }

  /**
   * Checks if a category is rate limited
   *
   * @deprecated Please use `isRateLimited` from @sentry/utils
   */
  protected _isRateLimited(requestType: SentryRequestType): boolean {
    const category = requestTypeToCategory(requestType);
    return isRateLimited(this._rateLimits, category);
  }

  protected abstract _sendRequest(
    sentryRequest: SentryRequest,
    originalPayload: Event | Session,
  ): PromiseLike<SentryResponse>;
}
