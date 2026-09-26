import * as http from 'node:http';
import { Readable, type Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import {
  debug,
  type DsnComponents,
  dsnToString,
  getEnvelopeEndpointWithUrlEncodedAuth,
  makeDsn,
  makePromiseBuffer,
  type PromiseBuffer,
} from '@sentry/core';
import {
  ENVELOPE_HEADER_MAX_BYTES,
  MAX_ENVELOPE_BYTES,
  MAX_PENDING_UPLOADS,
  MAX_REPORTED_FAILURES,
  TUNNEL_PORT,
} from './constants';
import { DEBUG_BUILD } from './debug-build';
import type { EnvelopeHeader } from './types';
import { logError, logWarn } from './utils';

/**
 * What `makeNodeTransport` can put on the wire; it gzips anything over 32 KiB. A `Map` rather than
 * an object literal so a coding the sender chose cannot name something off `Object.prototype`.
 */
const DECOMPRESSORS = new Map<string, () => Transform>([
  ['gzip', createGunzip],
  ['deflate', createInflate],
  ['br', createBrotliDecompress],
]);

const NEWLINE = 0x0a;

/**
 * A header value is the sender's, so it arrives in whatever case they chose. It is always one
 * string: Node types this header as such, and joins duplicates with `, ` rather than collecting
 * them the way it does `set-cookie`.
 *
 * Only the first coding is read. RFC 9110 lists codings in the order they were applied, so a body
 * carrying more than one would have to be decoded from the last backwards — which nothing here
 * does, and which `makeNodeTransport` never produces: it applies gzip or nothing.
 */
function codingOf(contentEncoding: string | undefined): string {
  return (contentEncoding ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Reads the request body, refusing one too large to hold.
 *
 * The bound is on the compressed bytes because they are buffered in full before anything validates
 * them: `ENVELOPE_HEADER_MAX_BYTES` bounds only what a body inflates to, so without this the
 * extension would already be holding whatever a sender chose to send by the time that applied.
 *
 * Typed over `ArrayBuffer` rather than `ArrayBufferLike` because `BodyInit` excludes views backed
 * by a `SharedArrayBuffer`, and without the annotation these bytes cannot reach `fetch` as they
 * were read. Copying them into a fresh buffer to satisfy it would hold a second copy of every
 * envelope in flight, which on a 128MB function is memory the extension does not have.
 */
async function readBody(req: http.IncomingMessage): Promise<Buffer<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;

    if (bytes > MAX_ENVELOPE_BYTES) {
      throw new Error('The envelope is larger than this extension will buffer');
    }

    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

/**
 * The envelope header is the first line and it carries the DSN the allowlist needs, so a compressed
 * body has to be read before it can be validated — but only that far.
 *
 * Inflated a chunk at a time and stopped at the newline, rather than in one shot: a one-shot
 * `maxOutputLength` bounds the whole body, and since `makeNodeTransport` only compresses past
 * 32KiB, every envelope the SDK actually gzips would exceed any bound small enough to protect the
 * memory the extension shares with the function.
 */
async function readEnvelopeHeader(body: Buffer, contentEncoding: string | undefined): Promise<EnvelopeHeader | null> {
  const decompress = DECOMPRESSORS.get(codingOf(contentEncoding));

  // Nullable because every JSON literal parses: `null`, a number and a string all get here, and
  // only the caller's optional chaining keeps them from throwing.
  return JSON.parse(await readFirstLine(body, decompress)) as EnvelopeHeader | null;
}

/**
 * Bytes throughout rather than characters: inflate splits its output on chunk boundaries, not on
 * character boundaries, so decoding each chunk as it arrives turns any multi-byte character
 * straddling two of them into replacement characters — and `length` on the decoded string would
 * count UTF-16 units against a bound expressed in bytes.
 */
async function readFirstLine(body: Buffer, decompress?: () => Transform): Promise<string> {
  if (!decompress) {
    return firstLineOf(body);
  }

  const stream = Readable.from(body).pipe(decompress());
  const header: Buffer[] = [];
  let bytes = 0;

  try {
    for await (const chunk of stream) {
      const newline = (chunk as Buffer).indexOf(NEWLINE);
      // Only the header counts towards the bound, and it is checked before the newline ends the
      // loop: measuring whole chunks instead would let a header through at whatever size the last
      // one happened to arrive at, which is the inflate chunk size again on top of the bound.
      const line = newline >= 0 ? (chunk as Buffer).subarray(0, newline) : (chunk as Buffer);

      header.push(line);
      bytes += line.length;

      if (bytes > ENVELOPE_HEADER_MAX_BYTES) {
        throw new Error('The envelope header is longer than this extension will inflate to read it');
      }

      if (newline >= 0) {
        break;
      }
    }
  } finally {
    stream.destroy();
  }

  return new TextDecoder().decode(Buffer.concat(header)) || '{}';
}

function firstLineOf(body: Buffer): string {
  const newline = body.indexOf(NEWLINE);

  return new TextDecoder().decode(newline >= 0 ? body.subarray(0, newline) : body) || '{}';
}

/**
 * `makeDsn` reports a malformed DSN through an ungated `console.error` that includes the string, so
 * an envelope header is caller-controlled text reaching CloudWatch verbatim. The guard is on the
 * characters rather than on the shape because the harm is forged log lines, and `URL.canParse`
 * accepts a newline: `http://host/\nERROR fake` parses.
 */
function parseEnvelopeDsn(envelopeDsn: string): DsnComponents | undefined {
  return hasControlCharacter(envelopeDsn) ? undefined : makeDsn(envelopeDsn);
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
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
      const envelopeBytes = await readBody(req);
      const contentEncoding = req.headers['content-encoding'];
      const envelope = await readEnvelopeHeader(envelopeBytes, contentEncoding);
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
        .add(async () => {
          const upstream = await fetch(getEnvelopeEndpointWithUrlEncodedAuth(dsn), {
            method: 'POST',
            body: envelopeBytes,
            headers: contentEncoding ? { 'content-encoding': contentEncoding } : undefined,
          });

          // `fetch` rejects for a transport failure alone, so without this a rate limit or a
          // rejected payload counts as a delivery and the drop is never reported. Draining first
          // because a response body left unread holds its connection until the socket times out.
          await upstream.body?.cancel();

          if (!upstream.ok) {
            throw new Error(`Sentry refused the envelope with status ${upstream.status}`);
          }
        })
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
