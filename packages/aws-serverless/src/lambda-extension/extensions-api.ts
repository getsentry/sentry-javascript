import * as http from 'node:http';
import { POLL_KEEPALIVE_MS } from './constants';
import type { ExtensionsApiRequest, ExtensionsApiResponse } from './types';

/**
 * Issues an Extensions API request that carries no deadline at any layer.
 *
 * "Do not set a timeout on the GET call, as the extension can be suspended for a period of time
 * until there is an event to return."
 * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#extensions-api-next
 *
 * `fetch` cannot honour that — Node applies undici's 300s `headersTimeout`, which abandons a
 * request the API may already have honoured — so registration goes through here too, not only the
 * poll. `agent: false` keeps the request out of a pool, the other place a deadline, or a socket
 * gone stale across a freeze, can live.
 */
export function request(
  url: string,
  { method = 'GET', headers, body }: ExtensionsApiRequest,
): Promise<ExtensionsApiResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { agent: false, method, headers }, res => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        }),
      );
      res.on('error', err => {
        req.destroy();
        reject(err);
      });
    });

    req.on('socket', socket => socket.setKeepAlive(true, POLL_KEEPALIVE_MS));
    req.on('error', reject);
    req.end(body);
  });
}

/** `JSON.parse` throws only for a malformed body; every JSON literal parses, including `null`. */
export function parseEvent(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
