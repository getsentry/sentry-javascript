import { eventToSentryRequest } from '@sentry/core';
import { Event, Response, TransportOptions } from '@sentry/types';
import * as http from 'http';

import { BaseTransport, HTTPTransport } from '../../../src/transports';
import { UrlContainer } from '../../../src/transports/base';

export class CustomUrlTransport extends HTTPTransport {
  public constructor(public options: TransportOptions, url: UrlContainer) {
    super(options);
    this.url = url;
  }
}

export class NoUrlTransport extends BaseTransport {
  public constructor(public options: TransportOptions) {
    super(options);

    const proxy = this._getProxy('http');
    this.module = http;
    this.client = proxy
      ? (new (require('https-proxy-agent'))(proxy) as http.Agent)
      : new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
  }

  public sendEvent(event: Event): Promise<Response> {
    return this._send(eventToSentryRequest(event, this._api), event);
  }

  public sendSession(): Promise<Response> {
    throw new Error('NOT_NEEDED');
  }
}
