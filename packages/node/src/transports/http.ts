import { eventToSentryRequest, sessionToSentryRequest } from '@sentry/core';
import { Event, Response, Session, SessionAggregates, TransportOptions } from '@sentry/types';
import * as http from 'http';

import { BaseTransport } from './base';

/** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    const proxy = this._getProxy('http');
    this.module = http;
    this.client = proxy
      ? (new (require('https-proxy-agent'))(proxy) as http.Agent)
      : new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
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
