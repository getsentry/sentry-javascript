import { createTransport } from '@sentry/core';
import type {
  BaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
  TransportRequestExecutor,
} from '@sentry/types';
import * as http from 'http';
import * as https from 'https';
import { Readable } from 'stream';
import { URL } from 'url';
import { createGzip } from 'zlib';

import type { HTTPModule } from './http-module';

export interface NodeTransportOptions extends BaseTransportOptions {
  /** Define custom headers */
  headers?: Record<string, string>;
  /** Set a proxy that should be used for outbound requests. */
  proxy?: string;
  /** HTTPS proxy CA certificates */
  caCerts?: string | Buffer | Array<string | Buffer>;
  /** Custom HTTP module. Defaults to the native 'http' and 'https' modules. */
  httpModule?: HTTPModule;
  /** Allow overriding connection keepAlive, defaults to false */
  keepAlive?: boolean;
}

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/**
 * Gets a stream from a Uint8Array or string
 * Readable.from is ideal but was added in node.js v12.3.0 and v10.17.0
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
  let urlSegments: URL;

  try {
    urlSegments = new URL(options.url);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/node]: Invalid dsn or tunnel option, will not send any events. The tunnel option must be a full URL when used.',
    );
    return createTransport(options, () => Promise.resolve({}));
  }

  const isHttps = urlSegments.protocol === 'https:';

  // Proxy prioritization: http => `options.proxy` | `process.env.http_proxy`
  // Proxy prioritization: https => `options.proxy` | `process.env.https_proxy` | `process.env.http_proxy`
  const proxy = applyNoProxyOption(
    urlSegments,
    options.proxy || (isHttps ? process.env.https_proxy : undefined) || process.env.http_proxy,
  );

  const nativeHttpModule = isHttps ? https : http;
  const keepAlive = options.keepAlive === undefined ? false : options.keepAlive;

  // TODO(v7): Evaluate if we can set keepAlive to true. This would involve testing for memory leaks in older node
  // versions(>= 8) as they had memory leaks when using it: #2555
  const agent = proxy
    ? // eslint-disable-next-line @typescript-eslint/no-var-requires
      (new (require('https-proxy-agent'))(proxy) as http.Agent)
    : new nativeHttpModule.Agent({ keepAlive, maxSockets: 30, timeout: 2000 });

  const requestExecutor = createRequestExecutor(options, options.httpModule ?? nativeHttpModule, agent);
  return createTransport(options, requestExecutor);
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
      let body = streamFromBody(request.body);

      const headers: Record<string, string> = { ...options.headers };

      if (request.body.length > GZIP_THRESHOLD) {
        headers['content-encoding'] = 'gzip';
        body = body.pipe(createGzip());
      }

      const req = httpModule.request(
        {
          method: 'POST',
          agent,
          headers,
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

          res.setEncoding('utf8');

          // "Key-value pairs of header names and values. Header names are lower-cased."
          // https://nodejs.org/api/http.html#http_message_headers
          const retryAfterHeader = res.headers['retry-after'] ?? null;
          const rateLimitsHeader = res.headers['x-sentry-rate-limits'] ?? null;

          resolve({
            statusCode: res.statusCode,
            headers: {
              'retry-after': retryAfterHeader,
              'x-sentry-rate-limits': Array.isArray(rateLimitsHeader) ? rateLimitsHeader[0] : rateLimitsHeader,
            },
          });
        },
      );

      req.on('error', reject);
      body.pipe(req);
    });
  };
}
