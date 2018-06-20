import { SentryError } from '@sentry/core';
import {
  DSNComponents,
  SentryEvent,
  Transport,
  TransportOptions,
} from '@sentry/types';
import { urlEncode } from '@sentry/utils';

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * @inheritDoc
   */
  public endpointUrl: string;

  public constructor(public options: TransportOptions) {
    this.endpointUrl = this.composeEndpointUrl(options.dsn);
  }

  /**
   * @inheritDoc
   */
  public composeEndpointUrl(dsn: DSNComponents): string {
    const auth = {
      sentry_key: dsn.user,
      sentry_secret: '',
      sentry_version: '7',
    };

    if (dsn.pass) {
      auth.sentry_secret = dsn.pass;
    } else {
      delete auth.sentry_secret;
    }

    const protocol = dsn.protocol ? `${dsn.protocol}:` : '';
    const port = dsn.port ? `:${dsn.port}` : '';
    const endpoint = `${protocol}//${dsn.host}${port}/api/${dsn.path}/store/`;

    // Auth is intentionally sent as part of query string (NOT as custom HTTP header)
    // to avoid preflight CORS requests
    return `${endpoint}?${urlEncode(auth)}`;
  }

  /**
   * @inheritDoc
   */
  public async send(_: SentryEvent): Promise<Response | XMLHttpRequest> {
    throw new SentryError('Transport Class has to implement `send` method');
  }
}
