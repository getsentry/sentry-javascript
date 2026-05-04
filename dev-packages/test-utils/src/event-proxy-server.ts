/* eslint-disable max-lines */
import type {
  Envelope,
  EnvelopeItem,
  Event,
  SerializedMetric,
  SerializedMetricContainer,
  SerializedSession,
  SerializedStreamedSpan,
  StreamedSpanEnvelope,
} from '@sentry/core';
import { parseEnvelope } from '@sentry/core';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as zlib from 'zlib';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

interface EventProxyServerOptions {
  /** Port to start the event proxy server at. */
  port: number;
  /** The name for the proxy server used for referencing it with listener functions */
  proxyServerName: string;
  /** A path to optionally output all Envelopes to. Can be used to compare event payloads before and after changes. */
  envelopeDumpPath?: string;
}

interface SentryRequestCallbackData {
  envelope: Envelope;
  rawProxyRequestBody: string;
  rawProxyRequestHeaders: Record<string, string | string[] | undefined>;
  rawSentryResponseBody: string;
  sentryResponseStatusCode?: number;
}

interface EventCallbackListener {
  (data: string): void;
}

type SentryResponseStatusCode = number;
type SentryResponseBody = string;
type SentryResponseHeaders = Record<string, string> | undefined;

type OnRequest = (
  eventCallbackListeners: Set<EventCallbackListener>,
  proxyRequest: http.IncomingMessage,
  proxyRequestBody: string,
  eventBuffer: BufferedEvent[],
) => Promise<[SentryResponseStatusCode, SentryResponseBody, SentryResponseHeaders]>;

interface BufferedEvent {
  timestamp: number;
  data: string;
}

/**
 * Start a generic proxy server.
 * The `onRequest` callback receives the incoming request and the request body,
 * and should return a promise that resolves to a tuple with:
 * statusCode, responseBody, responseHeaders
 */
export async function startProxyServer(
  options: {
    /** Port to start the event proxy server at. */
    port: number;
    /** The name for the proxy server used for referencing it with listener functions */
    proxyServerName: string;
  },
  onRequest?: OnRequest,
): Promise<void> {
  const eventBuffer: BufferedEvent[] = [];
  const eventCallbackListeners: Set<EventCallbackListener> = new Set();

  const proxyServer = http.createServer((proxyRequest, proxyResponse) => {
    const proxyRequestChunks: Uint8Array[] = [];

    proxyRequest.addListener('data', (chunk: Buffer) => {
      proxyRequestChunks.push(chunk);
    });

    proxyRequest.addListener('error', err => {
      // eslint-disable-next-line no-console
      console.log('[event-proxy-server] Warn: Receiving proxy request errored!', err);
      proxyResponse.writeHead(500);
      proxyResponse.write('{}', 'utf-8');
      proxyResponse.end();
    });

    proxyRequest.addListener('end', () => {
      const proxyRequestBody =
        proxyRequest.headers['content-encoding'] === 'gzip'
          ? zlib.gunzipSync(Buffer.concat(proxyRequestChunks)).toString()
          : Buffer.concat(proxyRequestChunks).toString();

      const callback: OnRequest =
        onRequest ||
        (async (eventCallbackListeners, proxyRequest, proxyRequestBody, eventBuffer) => {
          eventBuffer.push({ data: proxyRequestBody, timestamp: getNanosecondTimestamp() });

          eventCallbackListeners.forEach(listener => {
            listener(proxyRequestBody);
          });

          return [200, '{}', {}];
        });

      callback(eventCallbackListeners, proxyRequest, proxyRequestBody, eventBuffer)
        .then(([statusCode, responseBody, responseHeaders]) => {
          proxyResponse.writeHead(statusCode, responseHeaders);
          proxyResponse.write(responseBody, 'utf-8');
          proxyResponse.end();
        })
        .catch(error => {
          // eslint-disable-next-line no-console
          console.log('[event-proxy-server] Warn: Proxy server returned an error', error);
          proxyResponse.writeHead(500);
          proxyResponse.write('{}', 'utf-8');
          proxyResponse.end();
        });
    });
  });

  const proxyServerStartupPromise = new Promise<void>(resolve => {
    proxyServer.listen(options.port, () => {
      resolve();
    });
  });

  const eventCallbackServer = http.createServer((eventCallbackRequest, eventCallbackResponse) => {
    eventCallbackResponse.statusCode = 200;
    eventCallbackResponse.setHeader('connection', 'keep-alive');

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const searchParams = new URL(eventCallbackRequest.url!, 'http://justsomerandombasesothattheurlisparseable.com/')
      .searchParams;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const listenerTimestamp = Number(searchParams.get('timestamp')!);

    const callbackListener = (data: string): void => {
      eventCallbackResponse.write(data.concat('\n'), 'utf8');
    };

    eventCallbackListeners.add(callbackListener);

    eventBuffer.forEach(bufferedEvent => {
      if (bufferedEvent.timestamp >= listenerTimestamp) {
        callbackListener(bufferedEvent.data);
      }
    });

    eventCallbackRequest.on('close', () => {
      eventCallbackListeners.delete(callbackListener);
    });

    eventCallbackRequest.on('error', () => {
      eventCallbackListeners.delete(callbackListener);
    });
  });

  const eventCallbackServerStartupPromise = new Promise<void>(resolve => {
    eventCallbackServer.listen(0, () => {
      const port = String((eventCallbackServer.address() as AddressInfo).port);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      void registerCallbackServerPort(options.proxyServerName, port).then(resolve);
    });
  });

  await eventCallbackServerStartupPromise;
  await proxyServerStartupPromise;
}

/**
 * Starts an event proxy server that will proxy events to sentry when the `tunnel` option is used. Point the `tunnel`
 * option to this server (like this `tunnel: http://localhost:${port option}/`).
 */
export async function startEventProxyServer(options: EventProxyServerOptions): Promise<void> {
  if (options.envelopeDumpPath) {
    await fs.promises.mkdir(path.dirname(path.resolve(options.envelopeDumpPath)), { recursive: true });
    try {
      await fs.promises.unlink(path.resolve(options.envelopeDumpPath));
    } catch {
      // noop
    }
  }

  await startProxyServer(options, async (eventCallbackListeners, proxyRequest, proxyRequestBody, eventBuffer) => {
    const data: SentryRequestCallbackData = {
      envelope: parseEnvelope(proxyRequestBody),
      rawProxyRequestBody: proxyRequestBody,
      rawProxyRequestHeaders: proxyRequest.headers,
      rawSentryResponseBody: '',
      sentryResponseStatusCode: 200,
    };

    const dataString = Buffer.from(JSON.stringify(data)).toString('base64');

    eventBuffer.push({ data: dataString, timestamp: getNanosecondTimestamp() });

    eventCallbackListeners.forEach(listener => {
      listener(dataString);
    });

    if (options.envelopeDumpPath) {
      fs.appendFileSync(path.resolve(options.envelopeDumpPath), `${JSON.stringify(data.envelope)}\n`, 'utf-8');
    }

    return [
      200,
      '{}',
      {
        'Access-Control-Allow-Origin': '*',
      },
    ];
  });
}

/** Wait for any plain request being made to the proxy. */
export async function waitForPlainRequest(
  proxyServerName: string,
  callback: (eventData: string) => Promise<boolean> | boolean,
): Promise<string> {
  const eventCallbackServerPort = await retrieveCallbackServerPort(proxyServerName);

  return new Promise((resolve, reject) => {
    const request = http.request(
      `http://localhost:${eventCallbackServerPort}/?timestamp=${getNanosecondTimestamp()}`,
      {},
      response => {
        let eventContents = '';

        response.on('error', err => {
          reject(err);
        });

        response.on('data', (chunk: Buffer) => {
          const chunkString = chunk.toString('utf8');

          eventContents = eventContents.concat(chunkString);

          if (callback(eventContents)) {
            response.destroy();
            return resolve(eventContents);
          }
        });
      },
    );

    request.end();
  });
}

/** Wait for a request to be sent. */
export async function waitForRequest(
  proxyServerName: string,
  callback: (eventData: SentryRequestCallbackData) => Promise<boolean> | boolean,
  timestamp: number = getNanosecondTimestamp(),
): Promise<SentryRequestCallbackData> {
  const eventCallbackServerPort = await retrieveCallbackServerPort(proxyServerName);

  return new Promise<SentryRequestCallbackData>((resolve, reject) => {
    const request = http.request(
      `http://localhost:${eventCallbackServerPort}/?timestamp=${timestamp}`,
      {},
      response => {
        let eventContents = '';

        response.on('error', err => {
          reject(err);
        });

        response.on('data', (chunk: Buffer) => {
          const chunkString = chunk.toString('utf8');
          chunkString.split('').forEach(char => {
            if (char === '\n') {
              const eventCallbackData: SentryRequestCallbackData = JSON.parse(
                Buffer.from(eventContents, 'base64').toString('utf8'),
              );
              const callbackResult = callback(eventCallbackData);
              if (typeof callbackResult !== 'boolean') {
                callbackResult.then(
                  match => {
                    if (match) {
                      response.destroy();
                      resolve(eventCallbackData);
                    }
                  },
                  err => {
                    throw err;
                  },
                );
              } else if (callbackResult) {
                response.destroy();
                resolve(eventCallbackData);
              }
              eventContents = '';
            } else {
              eventContents = eventContents.concat(char);
            }
          });
        });
      },
    );

    request.end();
  });
}

/** Wait for a specific envelope item to be sent. */
export function waitForEnvelopeItem(
  proxyServerName: string,
  callback: (envelopeItem: EnvelopeItem) => Promise<boolean> | boolean,
  timestamp: number = getNanosecondTimestamp(),
): Promise<EnvelopeItem> {
  return new Promise((resolve, reject) => {
    waitForRequest(
      proxyServerName,
      async eventData => {
        const envelopeItems = eventData.envelope[1];
        for (const envelopeItem of envelopeItems) {
          if (await callback(envelopeItem)) {
            resolve(envelopeItem);
            return true;
          }
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/** Wait for an error to be sent. */
export function waitForError(
  proxyServerName: string,
  callback: (errorEvent: Event) => Promise<boolean> | boolean,
): Promise<Event> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(
      proxyServerName,
      async envelopeItem => {
        const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
        if (envelopeItemHeader.type === 'event' && (await callback(envelopeItemBody as Event))) {
          resolve(envelopeItemBody as Event);
          return true;
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/** Wait for an session to be sent. */
export function waitForSession(
  proxyServerName: string,
  callback: (session: SerializedSession) => Promise<boolean> | boolean,
): Promise<SerializedSession> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(
      proxyServerName,
      async envelopeItem => {
        const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
        if (envelopeItemHeader.type === 'session' && (await callback(envelopeItemBody as SerializedSession))) {
          resolve(envelopeItemBody as SerializedSession);
          return true;
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/** Wait for a transaction to be sent. */
export function waitForTransaction(
  proxyServerName: string,
  callback: (transactionEvent: Event) => Promise<boolean> | boolean,
): Promise<Event> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(
      proxyServerName,
      async envelopeItem => {
        const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
        if (envelopeItemHeader.type === 'transaction' && (await callback(envelopeItemBody as Event))) {
          resolve(envelopeItemBody as Event);
          return true;
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/**
 * A normalized child span, usable regardless of `traceLifecycle`.
 */
export interface ChildSpan {
  name: string;
  op: string | undefined;
  status: string | undefined;
  attributes: Record<string, unknown>;
}

/**
 * A shape-agnostic representation of a root span (a transaction in static mode,
 * or a segment span in streaming mode).
 */
export interface RootSpan {
  /** Transaction name / segment span name. */
  name: string;
  /** The `sentry.op` value, if present. */
  op: string | undefined;
  /** Span status (e.g. `ok`, `error`). */
  status: string | undefined;
  /** The trace ID for linking assertions. */
  traceId: string | undefined;
  /** Flat map of attributes (`contexts.trace.data` for transactions, flattened typed attributes for streamed spans). */
  attributes: Record<string, unknown>;
  /** Normalized child spans (`transaction.spans` in static mode, non-segment siblings in streaming mode). */
  childSpans: ChildSpan[];
  /** The raw envelope item body for advanced assertions. */
  raw: Event | SerializedStreamedSpan;
}

/**
 * Wait for a root span to be sent, regardless of `traceLifecycle`.
 * Matches `transaction` envelope items in static mode and segment spans
 * (`is_segment === true`) within `span` envelope items in streaming mode.
 */
export function waitForRootSpan(
  proxyServerName: string,
  callback: (rootSpan: RootSpan) => Promise<boolean> | boolean,
): Promise<RootSpan> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForRequest(
      proxyServerName,
      async eventData => {
        const envelopeItems = eventData.envelope[1];

        for (const envelopeItem of envelopeItems) {
          const [header, body] = envelopeItem;

          if (header.type === 'transaction') {
            const event = body as Event;
            const rootSpan: RootSpan = {
              name: event.transaction || '',
              op: event.contexts?.trace?.op,
              status: event.contexts?.trace?.status,
              traceId: event.contexts?.trace?.trace_id,
              attributes: { ...(event.contexts?.trace?.data ?? {}) } as Record<string, unknown>,
              childSpans: (event.spans || []).map(span => ({
                name: span.description || '',
                op: span.op,
                status: span.status,
                attributes: { ...(span.data ?? {}) } as Record<string, unknown>,
              })),
              raw: event,
            };
            if (await callback(rootSpan)) {
              resolve(rootSpan);
              return true;
            }
            continue;
          }

          if (isStreamedSpanEnvelopeItem(envelopeItem)) {
            const allItems = envelopeItem[1].items;
            for (const span of allItems) {
              if (!span.is_segment) {
                continue;
              }
              const flatAttributes: Record<string, unknown> = {};
              for (const [key, attr] of Object.entries(span.attributes ?? {})) {
                flatAttributes[key] = attr?.value;
              }
              const childSpans: ChildSpan[] = allItems
                .filter(s => s !== span)
                .map(s => {
                  const attrs: Record<string, unknown> = {};
                  for (const [key, attr] of Object.entries(s.attributes ?? {})) {
                    attrs[key] = attr?.value;
                  }
                  return { name: s.name, op: getSpanOp(s), status: s.status, attributes: attrs };
                });
              const rootSpan: RootSpan = {
                name: span.name,
                op: getSpanOp(span),
                status: span.status,
                traceId: span.trace_id,
                attributes: flatAttributes,
                childSpans,
                raw: span,
              };
              if (await callback(rootSpan)) {
                resolve(rootSpan);
                return true;
              }
            }
          }
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/**
 * Wait for metric items to be sent.
 */
export function waitForMetric(
  proxyServerName: string,
  callback: (metricEvent: SerializedMetric) => Promise<boolean> | boolean,
): Promise<SerializedMetric> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(
      proxyServerName,
      async envelopeItem => {
        const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
        const metricContainer = envelopeItemBody as SerializedMetricContainer;
        if (envelopeItemHeader.type === 'trace_metric') {
          for (const metric of metricContainer.items) {
            if (await callback(metric)) {
              resolve(metric);
              return true;
            }
          }
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/**
 * Check if an envelope item is a Span V2 container item.
 */
function isStreamedSpanEnvelopeItem(
  envelopeItem: EnvelopeItem,
): envelopeItem is [
  { type: 'span'; content_type: 'application/vnd.sentry.items.span.v2+json'; item_count: number },
  { items: SerializedStreamedSpan[] },
] {
  const [header] = envelopeItem;
  return (
    header.type === 'span' &&
    'content_type' in header &&
    header.content_type === 'application/vnd.sentry.items.span.v2+json'
  );
}

/**
 * Wait for a Span V2 envelope to be sent.
 * Returns the first Span V2 envelope that is sent that matches the callback.
 * If no callback is provided, returns the first Span V2 envelope that is sent.
 *
 * @example
 * ```ts
 * const envelope = await waitForSpanV2Envelope(PROXY_SERVER_NAME);
 * const spans = envelope[1][0][1].items;
 * expect(spans.length).toBeGreaterThan(0);
 * ```
 *
 * @example
 * ```ts
 * // With a filter callback
 * const envelope = await waitForSpanV2Envelope(PROXY_SERVER_NAME, envelope => {
 *   return envelope[1][0][1].items.length > 5;
 * });
 * ```
 */
export function waitForStreamedSpanEnvelope(
  proxyServerName: string,
  callback?: (spanEnvelope: StreamedSpanEnvelope) => Promise<boolean> | boolean,
): Promise<StreamedSpanEnvelope> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForRequest(
      proxyServerName,
      async eventData => {
        const envelope = eventData.envelope;
        const envelopeItems = envelope[1];

        // Check if this is a Span V2 envelope by looking for a Span V2 item
        const hasSpanV2Item = envelopeItems.some(item => isStreamedSpanEnvelopeItem(item));
        if (!hasSpanV2Item) {
          return false;
        }

        const spanV2Envelope = envelope as StreamedSpanEnvelope;

        if (callback) {
          return callback(spanV2Envelope);
        }

        return true;
      },
      timestamp,
    )
      .then(eventData => resolve(eventData.envelope as StreamedSpanEnvelope))
      .catch(reject);
  });
}

/**
 * Wait for a single Span V2 to be sent that matches the callback.
 * Returns the first Span V2 that is sent that matches the callback.
 * If no callback is provided, returns the first Span V2 that is sent.
 *
 * @example
 * ```ts
 * const span = await waitForSpanV2(PROXY_SERVER_NAME, span => {
 *   return span.name === 'GET /api/users';
 * });
 * expect(span.status).toBe('ok');
 * ```
 *
 * @example
 * ```ts
 * // Using the getSpanV2Op helper
 * const span = await waitForSpanV2(PROXY_SERVER_NAME, span => {
 *   return getSpanV2Op(span) === 'http.client';
 * });
 * ```
 */
export function waitForStreamedSpan(
  proxyServerName: string,
  callback: (span: SerializedStreamedSpan) => Promise<boolean> | boolean,
): Promise<SerializedStreamedSpan> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForRequest(
      proxyServerName,
      async eventData => {
        const envelope = eventData.envelope;
        const envelopeItems = envelope[1];

        for (const envelopeItem of envelopeItems) {
          if (!isStreamedSpanEnvelopeItem(envelopeItem)) {
            continue;
          }

          const spans = envelopeItem[1].items;

          for (const span of spans) {
            if (await callback(span)) {
              resolve(span);
              return true;
            }
          }
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/**
 * Wait for Span V2 spans to be sent. Returns all spans from the envelope for which the callback returns true.
 * If no callback is provided, returns all spans from the first Span V2 envelope.
 *
 * @example
 * ```ts
 * // Get all spans from the first envelope
 * const spans = await waitForSpansV2(PROXY_SERVER_NAME);
 * expect(spans.length).toBeGreaterThan(0);
 * ```
 *
 * @example
 * ```ts
 * // Filter for specific spans (same callback style as waitForSpanV2)
 * const httpSpans = await waitForSpansV2(PROXY_SERVER_NAME, spans => {
 *   return spans.some(span => getSpanV2Op(span) === 'http.client');
 * });
 * expect(httpSpans.length).toBe(2);
 * ```
 */
export function waitForStreamedSpans(
  proxyServerName: string,
  callback?: (spans: SerializedStreamedSpan[]) => Promise<boolean> | boolean,
): Promise<SerializedStreamedSpan[]> {
  const timestamp = getNanosecondTimestamp();
  return new Promise((resolve, reject) => {
    waitForRequest(
      proxyServerName,
      async eventData => {
        const envelope = eventData.envelope;
        const envelopeItems = envelope[1];

        for (const envelopeItem of envelopeItems) {
          if (isStreamedSpanEnvelopeItem(envelopeItem)) {
            const spans = envelopeItem[1].items;
            if (callback) {
              if (await callback(spans)) {
                resolve(spans);
                return true;
              }
            } else {
              resolve(spans);
              return true;
            }
          }
        }
        return false;
      },
      timestamp,
    ).catch(reject);
  });
}

/**
 * Helper to get the span operation from a Span V2 JSON object.
 *
 * @example
 * ```ts
 * const span = await waitForSpanV2(PROXY_SERVER_NAME, span => {
 *   return getSpanV2Op(span) === 'http.client';
 * });
 * ```
 */
export function getSpanOp(span: SerializedStreamedSpan): string | undefined {
  return span.attributes?.['sentry.op']?.type === 'string' ? span.attributes['sentry.op'].value : undefined;
}

const TEMP_FILE_PREFIX = 'event-proxy-server-';

async function registerCallbackServerPort(serverName: string, port: string): Promise<void> {
  const tmpFilePath = path.join(os.tmpdir(), `${TEMP_FILE_PREFIX}${serverName}`);
  await writeFile(tmpFilePath, port, { encoding: 'utf8' });
}

async function retrieveCallbackServerPort(serverName: string): Promise<string> {
  try {
    const tmpFilePath = path.join(os.tmpdir(), `${TEMP_FILE_PREFIX}${serverName}`);
    return await readFile(tmpFilePath, 'utf8');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Could not read callback server port', e);
    throw e;
  }
}

/**
 * We do nanosecond checking because the waitFor* calls and the fetch requests may come very shortly after one another.
 */
function getNanosecondTimestamp(): number {
  const NS_PER_SEC = 1e9;
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * NS_PER_SEC + nanoseconds;
}
