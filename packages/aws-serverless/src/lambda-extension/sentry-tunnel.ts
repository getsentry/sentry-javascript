import * as http from 'node:http';
import { buffer } from 'node:stream/consumers';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip, inflate } from 'node:zlib';
import {
  debug,
  type DsnComponents,
  dsnToString,
  getEnvelopeEndpointWithUrlEncodedAuth,
  makeDsn,
  makePromiseBuffer,
  type PromiseBuffer,
} from '@sentry/core';
import { ENVELOPE_HEADER_MAX_BYTES, MAX_PENDING_UPLOADS, MAX_REPORTED_FAILURES, TUNNEL_PORT } from './constants';
import { DEBUG_BUILD } from './debug-build';
import type { EnvelopeHeader } from './types';
import { logError, logWarn } from './utils';

/** What `makeNodeTransport` can put on the wire; it gzips anything over 32 KiB. */
const DECOMPRESSORS: Record<string, typeof gunzip> = {
  gzip: gunzip,
  deflate: inflate,
  br: brotliDecompress,
};

/** A header value is the sender's, so it arrives in whatever case and list form they chose. */
function codingOf(contentEncoding: string | string[] | undefined): string {
  const value = Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding;

  return (value ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
}

/**
 * The envelope header is the first line and it carries the DSN the allowlist needs, so a compressed
 * body has to be read before it can be validated — but only that far. Inflating the whole body
 * would let a highly compressible one exhaust the memory the extension shares with the function.
 */
async function readEnvelopeHeader(
  body: Buffer,
  contentEncoding: string | string[] | undefined,
): Promise<EnvelopeHeader | null> {
  const decompress = DECOMPRESSORS[codingOf(contentEncoding)];
  const readable = decompress
    ? await promisify(decompress)(body, { maxOutputLength: ENVELOPE_HEADER_MAX_BYTES })
    : body;

  // Nullable because every JSON literal parses: `null`, a number and a string all get here, and
  // only the caller's optional chaining keeps them from throwing.
  return JSON.parse(new TextDecoder().decode(readable).split('\n')[0] || '{}') as EnvelopeHeader | null;
}

/**
 * `makeDsn` reports a malformed DSN through an ungated `console.error`, so an envelope header is
 * caller-controlled text reaching the log verbatim — newlines included, which forges log lines.
 */
function parseEnvelopeDsn(envelopeDsn: string): DsnComponents | undefined {
  return URL.canParse(envelopeDsn) ? makeDsn(envelopeDsn) : undefined;
}

function respond(res: http.ServerResponse, statusCode: number, body: Record<string, string>): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
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

/**
 * Forwards envelopes the SDK posts locally on to Sentry, so the function never waits on an upload.
 *
 * Uploads are tracked rather than fired and forgotten, because the shutdown drain has to know what
 * is still in flight — untracked, an envelope in flight at teardown dies with the process.
 */
export class SentryTunnel {
  /** Tracks what is still in flight, so the shutdown drain knows what it is waiting for. */
  public readonly uploads: PromiseBuffer<unknown>;
  private _lastActivityAt: number;
  private _dropsReported: number;

  public constructor() {
    this.uploads = makePromiseBuffer(MAX_PENDING_UPLOADS);
    this._lastActivityAt = 0;
    this._dropsReported = 0;
  }

  /** When the tunnel last took a request. The shutdown drain waits for this to go quiet. */
  public get lastActivityAt(): number {
    return this._lastActivityAt;
  }

  public listen(port: number = TUNNEL_PORT): http.Server {
    const allowedDsnComponents = getSentryDSNFromEnv();

    if (!allowedDsnComponents) {
      logWarn(
        'SENTRY_DSN is not set or is invalid. The /envelope tunnel will forward any DSN in the envelope ' +
          'header without allowlist validation. Set SENTRY_DSN to the same DSN as your SDK to restrict ' +
          'outbound requests.',
      );
    }

    const server = http.createServer((req, res) => {
      this._lastActivityAt = Date.now();

      if (req.method !== 'POST' || !req.url?.startsWith('/envelope')) {
        respond(res, 404, { error: 'Not found' });
        return;
      }

      void this._forward(req, res, allowedDsnComponents);
    });

    server.listen(port, () => {
      DEBUG_BUILD && debug.log(`Sentry proxy listening on port ${port}`);
    });

    // Surfaced rather than exited on: the extension is registered by this point, and a process that
    // ends outside the shutdown phase is reported as `Extension.Crash` against the invocation in
    // flight — failing the customer's request over a tunnel only this SDK would have used.
    server.on('error', err => {
      logError('the envelope tunnel could not listen.', err);
    });

    return server;
  }

  private async _forward(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    allowedDsnComponents: DsnComponents | undefined,
  ): Promise<void> {
    try {
      const buf = await buffer(req);
      // Slice the underlying ArrayBuffer so only the data portion travels, without padding or offset.
      const envelopeBytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const contentEncoding = req.headers['content-encoding'];
      const envelope = await readEnvelopeHeader(buf, contentEncoding);
      const envelopeDsn = envelope?.dsn;

      if (!envelopeDsn) {
        respond(res, 400, { error: 'Invalid envelope: missing DSN' });
        return;
      }

      // Same allowlist check as `handleTunnelRequest` in @sentry/core (SSRF protection). Without
      // SENTRY_DSN any DSN is allowed, which is what the warning above is about.
      if (allowedDsnComponents && dsnToString(allowedDsnComponents) !== envelopeDsn) {
        // Reported like any other drop: the envelope is discarded, and `debug` cannot say so here.
        this._reportDrop('an envelope was rejected because its DSN is not the one this extension was given.');
        respond(res, 403, { error: 'DSN not allowed' });
        return;
      }

      const dsn = allowedDsnComponents || parseEnvelopeDsn(envelopeDsn);

      if (!dsn) {
        respond(res, 403, { error: 'Invalid DSN' });
        return;
      }

      // Forwarded exactly as it arrived, compression included, so the encoding has to travel with
      // it — decompressing only ever happened to read the header above.
      void this.uploads
        .add(() =>
          fetch(getEnvelopeEndpointWithUrlEncodedAuth(dsn), {
            method: 'POST',
            body: envelopeBytes as BodyInit,
            headers: contentEncoding ? { 'content-encoding': contentEncoding } : undefined,
          }),
        )
        .then(undefined, err => {
          // Also where a full buffer lands, which is a drop like any other rather than a silence.
          this._reportDrop('an envelope could not be delivered to Sentry.', err);
        });

      respond(res, 200, {});
    } catch (e) {
      this._reportDrop('an envelope could not be read and was dropped.', e);
      respond(res, 500, { error: 'Error tunneling to Sentry' });
    }
  }

  /**
   * A dropped envelope is silent data loss, so it goes to the console rather than to `debug`, which
   * is never enabled in this process — capped, so a Sentry outage cannot bill a line per envelope.
   */
  private _reportDrop(message: string, err?: unknown): void {
    if (this._dropsReported++ < MAX_REPORTED_FAILURES) {
      logError(message, ...(err === undefined ? [] : [err]));
    }
  }
}
