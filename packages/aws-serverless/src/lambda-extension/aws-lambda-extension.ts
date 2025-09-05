import * as http from 'node:http';
import { buffer } from 'node:stream/consumers';
import { debug, dsnFromString, getEnvelopeEndpointWithUrlEncodedAuth } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

/**
 * The Extension API Client.
 */
export class AwsLambdaExtension {
  private readonly _baseUrl: string;
  private _extensionId: string | null;

  public constructor() {
    this._baseUrl = `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2020-01-01/extension`;
    this._extensionId = null;
  }

  /**
   * Register this extension as an external extension with AWS.
   */
  public async register(): Promise<void> {
    const res = await fetch(`${this._baseUrl}/register`, {
      method: 'POST',
      body: JSON.stringify({
        events: ['INVOKE', 'SHUTDOWN'],
      }),
      headers: {
        'Content-Type': 'application/json',
        'Lambda-Extension-Name': 'sentry-extension',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to register with the extension API: ${await res.text()}`);
    }

    this._extensionId = res.headers.get('lambda-extension-identifier');
  }

  /**
   * Advances the extension to the next event.
   */
  public async next(): Promise<void> {
    if (!this._extensionId) {
      throw new Error('Extension ID is not set');
    }

    const res = await fetch(`${this._baseUrl}/event/next`, {
      headers: {
        'Lambda-Extension-Identifier': this._extensionId,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to advance to next event: ${await res.text()}`);
    }
  }

  /**
   * Reports an error to the extension API.
   * @param phase The phase of the extension.
   * @param err The error to report.
   */
  public async error(phase: 'init' | 'exit', err: Error): Promise<never> {
    if (!this._extensionId) {
      throw new Error('Extension ID is not set');
    }

    const errorType = `Extension.${err.name || 'UnknownError'}`;

    const res = await fetch(`${this._baseUrl}/${phase}/error`, {
      method: 'POST',
      body: JSON.stringify({
        errorMessage: err.message || err.toString(),
        errorType,
        stackTrace: [err.stack],
      }),
      headers: {
        'Content-Type': 'application/json',
        'Lambda-Extension-Identifier': this._extensionId,
        'Lambda-Extension-Function-Error': errorType,
      },
    });

    if (!res.ok) {
      DEBUG_BUILD && debug.error(`Failed to report error: ${await res.text()}`);
    }

    throw err;
  }

  /**
   * Starts the Sentry tunnel.
   */
  public startSentryTunnel(): void {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/envelope')) {
        try {
          const buf = await buffer(req);
          // Extract the actual bytes from the Buffer by slicing its underlying ArrayBuffer
          // This ensures we get only the data portion without any padding or offset
          const envelopeBytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          const envelope = new TextDecoder().decode(envelopeBytes);
          const piece = envelope.split('\n')[0];
          const header = JSON.parse(piece || '{}') as { dsn?: string };
          if (!header.dsn) {
            throw new Error('DSN is not set');
          }
          const dsn = dsnFromString(header.dsn);
          if (!dsn) {
            throw new Error('Invalid DSN');
          }
          const upstreamSentryUrl = getEnvelopeEndpointWithUrlEncodedAuth(dsn);

          fetch(upstreamSentryUrl, {
            method: 'POST',
            body: envelopeBytes,
          }).catch(err => {
            DEBUG_BUILD && debug.error('Error sending envelope to Sentry', err);
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        } catch (e) {
          DEBUG_BUILD && debug.error('Error tunneling to Sentry', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Error tunneling to Sentry' }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(9000, () => {
      DEBUG_BUILD && debug.log('Sentry proxy listening on port 9000');
    });

    server.on('error', err => {
      DEBUG_BUILD && debug.error('Error starting Sentry proxy', err);
      process.exit(1);
    });
  }
}
