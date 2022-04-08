import { BaseBackend, getEnvelopeEndpointWithUrlEncodedAuth, initAPIDetails } from '@sentry/core';
import { Event, EventHint, Severity, Transport, TransportOptions } from '@sentry/types';
import { makeDsn, resolvedSyncPromise, stackParserFromOptions } from '@sentry/utils';

import { eventFromMessage, eventFromUnknownInput } from './eventbuilder';
import { HTTPSTransport, HTTPTransport, makeNodeTransport } from './transports';
import { NodeOptions } from './types';

/**
 * The Sentry Node SDK Backend.
 * @hidden
 */
export class NodeBackend extends BaseBackend<NodeOptions> {
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    return resolvedSyncPromise(eventFromUnknownInput(stackParserFromOptions(this._options), exception, hint));
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): PromiseLike<Event> {
    return resolvedSyncPromise(
      eventFromMessage(stackParserFromOptions(this._options), message, level, hint, this._options.attachStacktrace),
    );
  }

  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const dsn = makeDsn(this._options.dsn);

    const transportOptions: TransportOptions = {
      ...this._options.transportOptions,
      ...(this._options.httpProxy && { httpProxy: this._options.httpProxy }),
      ...(this._options.httpsProxy && { httpsProxy: this._options.httpsProxy }),
      ...(this._options.caCerts && { caCerts: this._options.caCerts }),
      dsn: this._options.dsn,
      tunnel: this._options.tunnel,
      _metadata: this._options._metadata,
    };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }

    const api = initAPIDetails(transportOptions.dsn, transportOptions._metadata, transportOptions.tunnel);
    const url = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);

    this._newTransport = makeNodeTransport({
      url,
      headers: transportOptions.headers,
      proxy: transportOptions.httpProxy,
      caCerts: transportOptions.caCerts,
    });

    if (dsn.protocol === 'http') {
      return new HTTPTransport(transportOptions);
    }
    return new HTTPSTransport(transportOptions);
  }
}
