import {
  BaseTransportOptions,
  createTransport,
  NewTransport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';
import { TransportRequestExecutor } from '@sentry/core/dist/transports/base';
import { eventStatusFromHttpCode } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';

import { HTTPModule } from './base/http-module';

// TODO(v7):
// - Rename this file "transports.ts"
// - Move this file one folder upwards
// - Delete "transports" folder
// OR
// - Split this file up and leave it in the transports folder

export interface HttpTransportOptions extends BaseTransportOptions {
  /** Define custom headers */
  headers?: Record<string, string>;
  /** Set a proxy that should be used for outbound requests. */
  proxy?: string;
  /** HTTPS proxy CA certificates */
  caCerts?: string | Buffer | Array<string | Buffer>;
  /** Custom HTTP module */
  httpModule?: HTTPModule;
}

/**
 * Creates a Transport that uses http to send events to Sentry.
 */
export function makeNewHttpTransport(options: HttpTransportOptions): NewTransport {
  // Proxy prioritization: http  => `options.proxy` | `process.env.http_proxy`
  const proxy = applyNoProxyOption(options.url, options.proxy || process.env.http_proxy);

  const httpModule = options.httpModule ?? http;

  const agent = proxy
    ? (new (require('https-proxy-agent'))(proxy) as http.Agent)
    : new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });

  const requestExecutor = createRequestExecutor(options, httpModule, agent);
  return createTransport({ bufferSize: options.bufferSize }, requestExecutor);
}

/**
 * Creates a Transport that uses https to send events to Sentry.
 */
export function makeNewHttpsTransport(options: HttpTransportOptions): NewTransport {
  // Proxy prioritization: https => `options.proxy` | `process.env.https_proxy` | `process.env.http_proxy`
  const proxy = applyNoProxyOption(options.url, options.proxy || process.env.https_proxy || process.env.http_proxy);

  const httpsModule = options.httpModule ?? https;

  const agent = proxy
    ? (new (require('https-proxy-agent'))(proxy) as https.Agent)
    : new https.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });

  const requestExecutor = createRequestExecutor(options, httpsModule, agent);
  return createTransport({ bufferSize: options.bufferSize }, requestExecutor);
}

/**
 * Honors the `no_proxy` env variable with the highest priority to allow for hosts exclusion.
 *
 * @param transportUrl The URL the transport intends to send events to.
 * @param proxy The client configured proxy.
 * @returns A proxy the transport should use.
 */
function applyNoProxyOption(transportUrl: string, proxy: string | undefined): string | undefined {
  const { no_proxy } = process.env;

  const { host: transportUrlHost, hostname: transportUrlHostname } = new URL(transportUrl);

  const urlIsExemptFromProxy =
    no_proxy &&
    no_proxy
      .split(',')
      .some(exemption => transportUrlHost.endsWith(exemption) || transportUrlHostname.endsWith(exemption));

  if (urlIsExemptFromProxy) {
    return undefined;
  } else {
    return proxy;
  }
}

/**
 * Creates a RequestExecutor to be used with `createTransport`.
 */
function createRequestExecutor(
  options: HttpTransportOptions,
  httpModule: HTTPModule,
  agent: http.Agent,
): TransportRequestExecutor {
  const { hostname, pathname, port, protocol } = new URL(options.url);

  return function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    return new Promise((resolve, reject) => {
      const req = httpModule.request(
        {
          method: 'POST',
          agent,
          headers: options.headers,
          hostname,
          pathname,
          port,
          protocol,
          ca: options.caCerts,
        },
        res => {
          res.on('data', () => {
            // Drain socket
          });

          res.on('end', () => {
            // Drain socket
          });

          const statusCode = res.statusCode ?? 500;
          const status = eventStatusFromHttpCode(statusCode);

          res.setEncoding('utf8');

          // "Key-value pairs of header names and values. Header names are lower-cased."
          // https://nodejs.org/api/http.html#http_message_headers
          const retryAfterHeader = res.headers['retry-after'] ?? null;
          const rateLimitsHeader = res.headers['x-sentry-rate-limits'] ?? null;

          resolve({
            headers: {
              'retry-after': retryAfterHeader,
              'x-sentry-rate-limits': Array.isArray(rateLimitsHeader) ? rateLimitsHeader[0] : rateLimitsHeader,
            },
            reason: status,
            statusCode: statusCode,
          });
        },
      );

      req.on('error', reject);
      req.end(request.body);
    });
  };
}
