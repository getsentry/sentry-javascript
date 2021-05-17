import { eventToSentryRequest, sessionToSentryRequest } from '@sentry/core';
import { Event, Response, Session, SessionAggregates, TransportOptions } from '@sentry/types';
import * as https from 'https';

import { BaseTransport } from './base';

/** Node https module transport */
export class HTTPSTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    const proxy = this._getProxy('https');
    this.module = https;
    this.client = proxy
      ? (new (require('https-proxy-agent'))(proxy) as https.Agent)
      : new https.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    return this._send(eventToSentryRequest(event, this._api), event);
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: Session | SessionAggregates): PromiseLike<Response> {
    return this._send(sessionToSentryRequest(session, this._api), session);
  }
}
