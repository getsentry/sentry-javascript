import { eventToSentryRequest, sessionAggregateToSentryRequest } from '@sentry/core';
import { Event, Response, SessionAggregate, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as http from 'http';

import { BaseTransport } from './base';

/** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    const proxy = options.httpProxy || process.env.http_proxy;
    this.module = http;
    this.client = proxy
      ? (new (require('https-proxy-agent'))(proxy) as http.Agent)
      : new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    if (!this.module) {
      throw new SentryError('No module available in HTTPTransport');
    }
    return this._sendWithModule(this.module, eventToSentryRequest(event, this._api));
  }

  /**
   * @inheritDoc
   */
  public sendSessionAggregate(sessionAggregate: SessionAggregate): PromiseLike<Response> {
    if (!this.module) {
      throw new SentryError('No module available in HTTPTransport');
    }
    return this._sendWithModule(this.module, sessionAggregateToSentryRequest(sessionAggregate, this._api));
  }
}
