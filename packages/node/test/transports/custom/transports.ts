import { TransportOptions } from '@sentry/types';

import { HTTPTransport } from '../../../src/transports';
import { UrlParser } from '../../../src/transports/base';

export class CustomUrlTransport extends HTTPTransport {
  public constructor(public options: TransportOptions, urlParser: UrlParser) {
    super(options);
    this.urlParser = urlParser;
  }
}
