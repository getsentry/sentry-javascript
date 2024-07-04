import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as zlib from 'zlib';
import type { Envelope, EnvelopeItem, Event } from '@sentry/types';
import { parseEnvelope } from '@sentry/utils';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

interface EventProxyServerOptions {
  /** Port to start the event proxy server at. */
  port: number;
  /** The name for the proxy server used for referencing it with listener functions */
  proxyServerName: string;
  /**
   * Whether or not to forward the event to sentry. @default `true`
   * This is helpful when you can't register a tunnel in the SDK setup (e.g. lambda layer without Sentry.init call)
   */
  forwardToSentry?: boolean;
}

interface SentryRequestCallbackData {
  envelope: Envelope;
  rawProxyRequestBody: string;
  rawSentryResponseBody: string;
  sentryResponseStatusCode?: number;
}

type OnRequest = (
  eventCallbackListeners: Set<(data: string) => void>,
  proxyRequest: http.IncomingMessage,
  proxyRequestBody: string,
) => Promise<[number, string, Record<string, string> | undefined]>;

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
  const eventCallbackListeners: Set<(data: string) => void> = new Set();

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
        (async (eventCallbackListeners, proxyRequest, proxyRequestBody) => {
          eventCallbackListeners.forEach(listener => {
            listener(proxyRequestBody);
          });

          return [200, '{}', {}];
        });

      callback(eventCallbackListeners, proxyRequest, proxyRequestBody)
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

    const callbackListener = (data: string): void => {
      eventCallbackResponse.write(data.concat('\n'), 'utf8');
    };

    eventCallbackListeners.add(callbackListener);

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
  await startProxyServer(options, async (eventCallbackListeners, proxyRequest, proxyRequestBody) => {
    const envelopeHeader: EnvelopeItem[0] = JSON.parse(proxyRequestBody.split('\n')[0] as string);

    const shouldForwardEventToSentry = options.forwardToSentry != null ? options.forwardToSentry : true;

    if (!envelopeHeader.dsn && shouldForwardEventToSentry) {
      // eslint-disable-next-line no-console
      console.log(
        '[event-proxy-server] Warn: No dsn on envelope header. Maybe a client-report was received. Proxy request body:',
        proxyRequestBody,
      );

      return [200, '{}', {}];
    }

    if (!shouldForwardEventToSentry) {
      const data: SentryRequestCallbackData = {
        envelope: parseEnvelope(proxyRequestBody),
        rawProxyRequestBody: proxyRequestBody,
        rawSentryResponseBody: '',
        sentryResponseStatusCode: 200,
      };
      eventCallbackListeners.forEach(listener => {
        listener(Buffer.from(JSON.stringify(data)).toString('base64'));
      });

      return [200, '{}', {}];
    }

    const { origin, pathname, host } = new URL(envelopeHeader.dsn as string);

    const projectId = pathname.substring(1);
    const sentryIngestUrl = `${origin}/api/${projectId}/envelope/`;

    proxyRequest.headers.host = host;

    const reqHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(proxyRequest.headers)) {
      reqHeaders[key] = value as string;
    }

    // Fetch does not like this
    delete reqHeaders['transfer-encoding'];

    return fetch(sentryIngestUrl, {
      body: proxyRequestBody,
      headers: reqHeaders,
      method: proxyRequest.method,
    }).then(async res => {
      const rawSentryResponseBody = await res.text();
      const data: SentryRequestCallbackData = {
        envelope: parseEnvelope(proxyRequestBody),
        rawProxyRequestBody: proxyRequestBody,
        rawSentryResponseBody,
        sentryResponseStatusCode: res.status,
      };

      eventCallbackListeners.forEach(listener => {
        listener(Buffer.from(JSON.stringify(data)).toString('base64'));
      });

      const resHeaders: Record<string, string> = {};
      for (const [key, value] of res.headers.entries()) {
        resHeaders[key] = value;
      }

      return [res.status, rawSentryResponseBody, resHeaders];
    });
  });
}

/** Wait for any plain request being made to the proxy. */
export async function waitForPlainRequest(
  proxyServerName: string,
  callback: (eventData: string) => Promise<boolean> | boolean,
): Promise<string> {
  const eventCallbackServerPort = await retrieveCallbackServerPort(proxyServerName);

  return new Promise((resolve, reject) => {
    const request = http.request(`http://localhost:${eventCallbackServerPort}/`, {}, response => {
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
    });

    request.end();
  });
}

/** Wait for a request to be sent. */
export async function waitForRequest(
  proxyServerName: string,
  callback: (eventData: SentryRequestCallbackData) => Promise<boolean> | boolean,
): Promise<SentryRequestCallbackData> {
  const eventCallbackServerPort = await retrieveCallbackServerPort(proxyServerName);

  return new Promise<SentryRequestCallbackData>((resolve, reject) => {
    const request = http.request(`http://localhost:${eventCallbackServerPort}/`, {}, response => {
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
    });

    request.end();
  });
}

/** Wait for a specific envelope item to be sent. */
export function waitForEnvelopeItem(
  proxyServerName: string,
  callback: (envelopeItem: EnvelopeItem) => Promise<boolean> | boolean,
): Promise<EnvelopeItem> {
  return new Promise((resolve, reject) => {
    waitForRequest(proxyServerName, async eventData => {
      const envelopeItems = eventData.envelope[1];
      for (const envelopeItem of envelopeItems) {
        if (await callback(envelopeItem)) {
          resolve(envelopeItem);
          return true;
        }
      }
      return false;
    }).catch(reject);
  });
}

/** Wait for an error to be sent. */
export function waitForError(
  proxyServerName: string,
  callback: (transactionEvent: Event) => Promise<boolean> | boolean,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(proxyServerName, async envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'event' && (await callback(envelopeItemBody as Event))) {
        resolve(envelopeItemBody as Event);
        return true;
      }
      return false;
    }).catch(reject);
  });
}

/** Wait for a transaction to be sent. */
export function waitForTransaction(
  proxyServerName: string,
  callback: (transactionEvent: Event) => Promise<boolean> | boolean,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(proxyServerName, async envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'transaction' && (await callback(envelopeItemBody as Event))) {
        resolve(envelopeItemBody as Event);
        return true;
      }
      return false;
    }).catch(reject);
  });
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
