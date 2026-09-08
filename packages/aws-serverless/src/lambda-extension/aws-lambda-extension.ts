import * as http from 'node:http';
import { buffer } from 'node:stream/consumers';
import {
  consoleSandbox,
  debug,
  type DsnComponents,
  dsnToString,
  getEnvelopeEndpointWithUrlEncodedAuth,
  makeDsn,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

const POLL_RETRY_BASE_MS = 100;
const POLL_RETRY_MAX_MS = 5_000;
/** Bounded so a permanently unreachable API exits instead of logging every 5s forever. */
const POLL_MAX_CONSECUTIVE_FAILURES = 20;

/** The body lands in an error message that a failing poll writes to the console. */
const ERROR_BODY_MAX_LENGTH = 200;

/**
 * Detects a peer that went away without a FIN/RST, which a request deadline cannot do here: the
 * poll is open across the environment's frozen idle time, which is unbounded, and a socket
 * deadline runs on real time and would fire on thaw after a long idle — destroying a poll that
 * was about to be answered. Keep-alive probes only travel while the environment is running.
 */
const POLL_KEEPALIVE_MS = 30_000;

/** 408 and 429 are the retryable ones; the rest of 4xx means the poll itself is refused. */
const RETRYABLE_CLIENT_ERRORS = [408, 429];

interface ExtensionEvent {
  eventType?: string;
}

interface ExtensionsApiResponse {
  statusCode: number;
  body: string;
}

export class ExtensionsApiError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ExtensionsApiError';
  }
}

/**
 * Structural rather than `instanceof`: the check has to hold for an error that crossed a
 * module boundary, and a transport failure carries `code`, never `statusCode`.
 */
function isClientError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode;
  return (
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500 &&
    !RETRYABLE_CLIENT_ERRORS.includes(statusCode)
  );
}

/**
 * Exported only for testing purposes.
 *
 * `fetch` cannot be used for the long poll: Node's implementation applies undici's 300s
 * `headersTimeout`, and lifting it would mean passing a dispatcher and depending on `undici`
 * directly. `http.request` has no default timeout, and the Extensions API is plain HTTP on
 * localhost.
 */
export function request(url: string, headers: Record<string, string>): Promise<ExtensionsApiResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      res.on('error', err => {
        req.destroy();
        reject(err);
      });
    });

    req.on('socket', socket => socket.setKeepAlive(true, POLL_KEEPALIVE_MS));

    req.on('error', reject);
    req.end();
  });
}

function truncate(body: string): string {
  return body.length > ERROR_BODY_MAX_LENGTH ? `${body.slice(0, ERROR_BODY_MAX_LENGTH)}...` : body;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

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

    if (!this._extensionId) {
      throw new Error('Extensions API accepted the registration without returning an extension identifier');
    }
  }

  /**
   * Advances the extension to the next event and returns it.
   */
  public async next(): Promise<ExtensionEvent> {
    if (!this._extensionId) {
      throw new Error('Extension ID is not set');
    }

    // This request blocks until the next event arrives, so it stays open for the whole
    // duration of the current invocation. Under `fetch` that is capped at 300s, so any
    // invocation that runs longer than that loses the extension partway through.
    const res = await request(`${this._baseUrl}/event/next`, {
      'Lambda-Extension-Identifier': this._extensionId,
      'Content-Type': 'application/json',
    });

    if (res.statusCode < 200 || res.statusCode > 299) {
      throw new ExtensionsApiError(`Failed to advance to next event: ${truncate(res.body)}`, res.statusCode);
    }

    try {
      return JSON.parse(res.body) as ExtensionEvent;
    } catch {
      // Not an empty event: `run` reads `eventType` to decide when to stop, so a body it cannot
      // read has to be a failed poll. Returning `{}` would look like an INVOKE — resetting the
      // backoff and re-polling with no delay, which spins the loop on any endpoint answering
      // 200 with something that is not JSON, and skips the SHUTDOWN exit.
      throw new Error(`Failed to parse the event from the Extensions API: ${truncate(res.body)}`);
    }
  }

  /**
   * Polls the Extensions API until the environment shuts down.
   *
   * A failed poll is retried rather than ending the loop. Lambda only completes an invocation
   * once the runtime and every registered extension have asked for the next event, so an
   * extension that stops polling does not fail loudly — it leaves every later invocation on
   * that execution environment running until the function timeout kills it.
   */
  public async run(): Promise<void> {
    let consecutiveFailures = 0;

    for (;;) {
      try {
        const event = await this.next();
        consecutiveFailures = 0;

        // The runtime API is torn down right after this, so polling again would only produce
        // errors on the way out.
        if (event.eventType === 'SHUTDOWN') {
          return;
        }
      } catch (err) {
        // A poll the API refuses outright is not going to start working; retrying only buries
        // the reason under a console error every few seconds for the life of the environment.
        if (isClientError(err)) {
          throw err;
        }

        consecutiveFailures++;

        // Same reasoning once a recoverable-looking failure stops recovering.
        if (consecutiveFailures >= POLL_MAX_CONSECUTIVE_FAILURES) {
          throw err;
        }

        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.error('Sentry Lambda extension: polling the Extensions API failed, retrying.', err);
        });

        await sleep(Math.min(POLL_RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), POLL_RETRY_MAX_MS));
      }
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
    const allowedDsnComponents = getSentryDSNFromEnv();

    if (!allowedDsnComponents) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          'Sentry Lambda extension: SENTRY_DSN is not set or is invalid. The /envelope tunnel will forward ' +
            'any DSN in the envelope header without allowlist validation. Set SENTRY_DSN to the same DSN as ' +
            'your SDK to restrict outbound requests.',
        );
      });
    }

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
          const envelopeDsn = header.dsn;
          if (!envelopeDsn) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid envelope: missing DSN' }));
            return;
          }

          // When SENTRY_DSN is set, same allowlist check as handleTunnelRequest in @sentry/core (SSRF protection).
          // If not set, we allow any DSN (but warn about this once, above)
          if (allowedDsnComponents) {
            if (dsnToString(allowedDsnComponents) !== envelopeDsn) {
              DEBUG_BUILD &&
                debug.warn(`Sentry Lambda extension tunnel: rejected request with unauthorized DSN (${envelopeDsn})`);
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'DSN not allowed' }));
              return;
            }
          }

          const dsn = allowedDsnComponents || makeDsn(envelopeDsn);
          if (!dsn) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid DSN' }));
            return;
          }
          const upstreamSentryUrl = getEnvelopeEndpointWithUrlEncodedAuth(dsn);

          fetch(upstreamSentryUrl, {
            method: 'POST',
            body: envelopeBytes as BodyInit,
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

/**
 * DSN components allowed for the Lambda extension `/envelope` tunnel, derived from `SENTRY_DSN`.
 *
 * Exported only for testing purposes.
 */
export function getSentryDSNFromEnv(): DsnComponents | undefined {
  const raw = process.env.SENTRY_DSN?.trim();
  return raw ? makeDsn(raw) : undefined;
}
