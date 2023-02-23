import type { Envelope, EnvelopeItem, Event } from '@sentry/types';
import { parseEnvelope } from '@sentry/utils';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

interface EventProxyServerOptions {
  /** Port to start the event proxy server at. */
  port: number;
  /** The name for the proxy server used for referencing it with listener functions */
  proxyServerName: string;
}

interface SentryRequestCallbackData {
  envelope: Envelope;
  rawProxyRequestBody: string;
  rawSentryResponseBody: string;
  sentryResponseStatusCode?: number;
}

/**
 * Starts an event proxy server that will proxy events to sentry when the `tunnel` option is used. Point the `tunnel`
 * option to this server (like this `tunnel: http://localhost:${port option}/`).
 */
export async function startEventProxyServer(options: EventProxyServerOptions): Promise<void> {
  const eventCallbackListeners: Set<(data: string) => void> = new Set();

  const proxyServer = http.createServer((proxyRequest, proxyResponse) => {
    const proxyRequestChunks: Uint8Array[] = [];

    proxyRequest.addListener('data', (chunk: Buffer) => {
      proxyRequestChunks.push(chunk);
    });

    proxyRequest.addListener('error', err => {
      throw err;
    });

    proxyRequest.addListener('end', () => {
      const proxyRequestBody = Buffer.concat(proxyRequestChunks).toString();
      const envelopeHeader: { dsn?: string } = JSON.parse(proxyRequestBody.split('\n')[0]);

      if (!envelopeHeader.dsn) {
        throw new Error('[event-proxy-server] No dsn on envelope header. Please set tunnel option.');
      }

      const { origin, pathname, host } = new URL(envelopeHeader.dsn);

      const projectId = pathname.substring(1);
      const sentryIngestUrl = `${origin}/api/${projectId}/envelope/`;

      proxyRequest.headers.host = host;

      const sentryResponseChunks: Uint8Array[] = [];

      const sentryRequest = https.request(
        sentryIngestUrl,
        { headers: proxyRequest.headers, method: proxyRequest.method },
        sentryResponse => {
          sentryResponse.addListener('data', (chunk: Buffer) => {
            proxyResponse.write(chunk, 'binary');
            sentryResponseChunks.push(chunk);
          });

          sentryResponse.addListener('end', () => {
            eventCallbackListeners.forEach(listener => {
              const rawProxyRequestBody = Buffer.concat(proxyRequestChunks).toString();
              const rawSentryResponseBody = Buffer.concat(sentryResponseChunks).toString();

              const data: SentryRequestCallbackData = {
                envelope: parseEnvelope(rawProxyRequestBody, new TextEncoder(), new TextDecoder()),
                rawProxyRequestBody,
                rawSentryResponseBody,
                sentryResponseStatusCode: sentryResponse.statusCode,
              };

              listener(Buffer.from(JSON.stringify(data)).toString('base64'));
            });
            proxyResponse.end();
          });

          sentryResponse.addListener('error', err => {
            throw err;
          });

          proxyResponse.writeHead(sentryResponse.statusCode || 500, sentryResponse.headers);
        },
      );

      sentryRequest.write(Buffer.concat(proxyRequestChunks), 'binary');
      sentryRequest.end();
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
    const listener = eventCallbackServer.listen(0, () => {
      const port = String((listener.address() as AddressInfo).port);
      const tmpFileWithPort = path.join(os.tmpdir(), `event-proxy-server-${options.proxyServerName}`);
      fs.writeFileSync(tmpFileWithPort, port, { encoding: 'utf8' });
      resolve();
    });
  });

  await eventCallbackServerStartupPromise;
  await proxyServerStartupPromise;
  return;
}

export function waitForRequest(
  proxyServerName: string,
  callback: (eventData: SentryRequestCallbackData) => boolean,
): Promise<SentryRequestCallbackData> {
  const tmpFileWithPort = path.join(os.tmpdir(), `event-proxy-server-${proxyServerName}`);
  const eventCallbackServerPort = fs.readFileSync(tmpFileWithPort, 'utf8');

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
            if (callback(eventCallbackData)) {
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

export function waitForEnvelopeItem(
  proxyServerName: string,
  callback: (envelopeItem: EnvelopeItem) => boolean,
): Promise<EnvelopeItem> {
  return new Promise((resolve, reject) => {
    waitForRequest(proxyServerName, eventData => {
      const envelopeItems = eventData.envelope[1];
      for (const envelopeItem of envelopeItems) {
        if (callback(envelopeItem)) {
          resolve(envelopeItem);
          return true;
        }
      }
      return false;
    }).catch(reject);
  });
}

export function waitForError(proxyServerName: string, callback: (transactionEvent: Event) => boolean): Promise<Event> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(proxyServerName, envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'event' && callback(envelopeItemBody as Event)) {
        resolve(envelopeItemBody as Event);
        return true;
      }
      return false;
    }).catch(reject);
  });
}

export function waitForTransaction(
  proxyServerName: string,
  callback: (transactionEvent: Event) => boolean,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    waitForEnvelopeItem(proxyServerName, envelopeItem => {
      const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
      if (envelopeItemHeader.type === 'transaction' && callback(envelopeItemBody as Event)) {
        resolve(envelopeItemBody as Event);
        return true;
      }
      return false;
    }).catch(reject);
  });
}
