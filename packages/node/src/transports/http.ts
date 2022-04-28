import { createTransport } from '@sentry/core';
import {
  BaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
  TransportRequestExecutor,
} from '@sentry/types';
import { eventStatusFromHttpCode } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';
import { Readable, Writable } from 'stream';
import { URL } from 'url';
import { createGzip } from 'zlib';

import { HTTPModule } from './http-module';

export interface NodeTransportOptions extends BaseTransportOptions {
  /** Define custom headers */
  headers?: Record<string, string>;
  /** Set a proxy that should be used for outbound requests. */
  proxy?: string;
  /** HTTPS proxy CA certificates */
  caCerts?: string | Buffer | Array<string | Buffer>;
  /** Custom HTTP module. Defaults to the native 'http' and 'https' modules. */
  httpModule?: HTTPModule;
}

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/**
 * Gets a stream from a Uint8Array or string
 * We don't have Readable.from in earlier versions of node
 */
function streamFromBody(body: Uint8Array | string): Readable {
  return new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
}

/**
 * Creates a Transport that uses native the native 'http' and 'https' modules to send events to Sentry.
 */
export function makeNodeTransport(options: NodeTransportOptions): Transport {
  const urlSegments = new URL(options.url);
  const isHttps = urlSegments.protocol === 'https:';

  // Proxy prioritization: http => `options.proxy` | `process.env.http_proxy`
  // Proxy prioritization: https => `options.proxy` | `process.env.https_proxy` | `process.env.http_proxy`
  const proxy = applyNoProxyOption(
    urlSegments,
    options.proxy || (isHttps ? process.env.https_proxy : undefined) || process.env.http_proxy,
  );

  const nativeHttpModule = isHttps ? https : http;

  // TODO(v7): Evaluate if we can set keepAlive to true. This would involve testing for memory leaks in older node
  // versions(>= 8) as they had memory leaks when using it: #2555
  const agent = proxy
    ? (new (require('https-proxy-agent'))(proxy) as http.Agent)
    : new nativeHttpModule.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });

  const requestExecutor = createRequestExecutor(options, options.httpModule ?? nativeHttpModule, agent);
  return createTransport({ bufferSize: options.bufferSize }, requestExecutor);
}

/**
 * Honors the `no_proxy` env variable with the highest priority to allow for hosts exclusion.
 *
 * @param transportUrl The URL the transport intends to send events to.
 * @param proxy The client configured proxy.
 * @returns A proxy the transport should use.
 */
function applyNoProxyOption(transportUrlSegments: URL, proxy: string | undefined): string | undefined {
  const { no_proxy } = process.env;

  const urlIsExemptFromProxy =
    no_proxy &&
    no_proxy
      .split(',')
      .some(
        exemption => transportUrlSegments.host.endsWith(exemption) || transportUrlSegments.hostname.endsWith(exemption),
      );

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
  options: NodeTransportOptions,
  httpModule: HTTPModule,
  agent: http.Agent,
): TransportRequestExecutor {
  const { hostname, pathname, port, protocol, search } = new URL(options.url);
  return function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    return new Promise((resolve, reject) => {
      let bodyStream = streamFromBody(request.body);

      if (request.body.length > GZIP_THRESHOLD) {
        options.headers = options.headers || {};
        options.headers['Content-Encoding'] = 'gzip';
        bodyStream = bodyStream.pipe(createGzip());
      }

      const req = httpModule.request(
        {
          method: 'POST',
          agent,
          headers: options.headers,
          hostname,
          path: `${pathname}${search}`,
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

      // The docs say that HTTPModuleClientRequest is Writable but the types don't match exactly
      bodyStream.pipe(req as unknown as Writable);
    });
  };
}
