import * as http from 'node:http';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import {
  ENVELOPE_HEADER_MAX_BYTES,
  MAX_REPORTED_FAILURES,
  SHUTDOWN_BUDGET_MS,
  SHUTDOWN_IDLE_GRACE_MS,
} from '../../src/lambda-extension/constants';
import { getSentryDSNFromEnv } from '../../src/lambda-extension/sentry-tunnel';
import { close, listen, spyOnExit } from './helpers';

describe('getSentryDSNFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Arranged rather than assumed: this repo's contributors are the likeliest people on earth to
    // have SENTRY_DSN exported, and the value it holds is not this suite's to destroy.
    vi.stubEnv('SENTRY_DSN', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('returns undefined when SENTRY_DSN is unset', () => {
    expect(getSentryDSNFromEnv()).toEqual(undefined);
  });

  test('returns canonical dsn string when SENTRY_DSN is valid', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@o1.ingest.sentry.io/1');

    expect(getSentryDSNFromEnv()).toEqual({
      protocol: 'https',
      publicKey: 'public',
      host: 'o1.ingest.sentry.io',
      projectId: '1',
      pass: '',
      path: '',
      port: '',
    });
  });

  test('returns undefined when SENTRY_DSN is invalid', () => {
    vi.stubEnv('SENTRY_DSN', 'not-a-dsn');

    expect(getSentryDSNFromEnv()).toEqual(undefined);
  });
});

const UPSTREAM_HOLD_MS = 500;

/**
 * Comfortably past what the header read will inflate to, which is the bound a one-shot inflate
 * would have tripped over. Derived from our own constant rather than from `@sentry/node`'s private
 * 32KiB gzip threshold: this size clears that too, so the envelope is one the SDK would really
 * have compressed, but the test does not silently stop being realistic if that threshold moves.
 */
const REALISTIC_GZIPPED_BYTES = ENVELOPE_HEADER_MAX_BYTES * 4;

describe('AwsLambdaExtension tunnel', () => {
  let servers: http.Server[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    servers = [];
    vi.stubEnv('SENTRY_DSN', undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await Promise.all(servers.map(close));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function track(server: http.Server): http.Server {
    servers.push(server);
    return server;
  }

  /** Starts a tunnel on an ephemeral port and hands back the base URL the SDK would post to. */
  async function startTunnel(extension = new AwsLambdaExtension()): Promise<string> {
    const tunnel = track(extension.startSentryTunnel(0));
    await new Promise<void>(resolve => tunnel.once('listening', resolve));

    return `http://127.0.0.1:${(tunnel.address() as AddressInfo).port}`;
  }

  /** Counts what actually left the extension, which is the only thing SSRF protection is about. */
  async function startUpstream(): Promise<{ dsn: string; received: string[]; encodings: (string | undefined)[] }> {
    const received: string[] = [];
    const encodings: (string | undefined)[] = [];
    const port = await listen(
      track(
        http.createServer((req, res) => {
          received.push(req.url ?? '');
          encodings.push(req.headers['content-encoding']);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        }),
      ),
      '127.0.0.1',
    );

    return { dsn: `http://public@127.0.0.1:${port}/1`, received, encodings };
  }

  function envelope(dsn: string): string {
    return `{"dsn":"${dsn}"}\n{"type":"event"}\n{}`;
  }

  test('forwards an envelope whose DSN matches the one the extension was given', async () => {
    const upstream = await startUpstream();
    vi.stubEnv('SENTRY_DSN', upstream.dsn);
    const extension = new AwsLambdaExtension();
    const url = await startTunnel(extension);

    const res = await fetch(`${url}/envelope`, { method: 'POST', body: envelope(upstream.dsn) });
    await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(upstream.received).toHaveLength(1);
  });

  test.each([['gzip', promisify(gzip)]])(
    'reads the header of a %s envelope, which is how the SDK sends anything over 32 KiB',
    async (encoding, compress) => {
      // `makeNodeTransport` gzips a body past GZIP_THRESHOLD and sets `content-encoding`. Parsing the
      // raw bytes as the envelope header throws on the magic bytes, which answered 500 and dropped
      // every large event — measured end to end with the real layer and the real SDK.
      const upstream = await startUpstream();
      vi.stubEnv('SENTRY_DSN', upstream.dsn);
      const extension = new AwsLambdaExtension();
      const url = await startTunnel(extension);
      const body = new Uint8Array(await compress(Buffer.from(envelope(upstream.dsn))));

      const res = await fetch(`${url}/envelope`, {
        method: 'POST',
        body,
        headers: { 'content-encoding': encoding },
      });
      await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

      expect(res.status).toBe(200);
      expect(upstream.received).toHaveLength(1);
      // Forwarded as it arrived, so Sentry has to be told it is still compressed.
      expect(upstream.encodings).toEqual([encoding]);
    },
  );

  test('rejects a compressed envelope whose DSN is not the one the extension was given', async () => {
    // The allowlist has to survive compression, or it is bypassed by setting one header.
    const upstream = await startUpstream();
    vi.stubEnv('SENTRY_DSN', upstream.dsn);
    const extension = new AwsLambdaExtension();
    const url = await startTunnel(extension);
    const body = new Uint8Array(await promisify(gzip)(Buffer.from(envelope('https://attacker@evil.example.com/1'))));

    const res = await fetch(`${url}/envelope`, {
      method: 'POST',
      body,
      headers: { 'content-encoding': 'gzip' },
    });
    await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

    expect(res.status).toBe(403);
    expect(upstream.received).toHaveLength(0);
  });

  test.each([['GZIP'], ['gzip, identity'], ['  gzip  ']])(
    'reads a body whose content-encoding arrives as %s',
    async encoding => {
      // The value is the sender's, so it comes in whatever case and list form they chose; a strict
      // match drops the envelope with a 500.
      const upstream = await startUpstream();
      vi.stubEnv('SENTRY_DSN', upstream.dsn);
      const extension = new AwsLambdaExtension();
      const url = await startTunnel(extension);
      const body = new Uint8Array(await promisify(gzip)(Buffer.from(envelope(upstream.dsn))));

      const res = await fetch(`${url}/envelope`, {
        method: 'POST',
        body,
        headers: { 'content-encoding': encoding },
      });
      await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

      expect(res.status).toBe(200);
      expect(upstream.received).toHaveLength(1);
    },
  );

  test.each([REALISTIC_GZIPPED_BYTES, REALISTIC_GZIPPED_BYTES * 10])(
    'forwards a gzipped envelope of %i bytes, the size at which the SDK actually compresses',
    async size => {
      // `makeNodeTransport` only gzips past 32KiB, so every envelope that arrives compressed is
      // larger than any bound small enough to protect the sandbox. Inflating the whole body to read
      // one line therefore fails on exactly the envelopes this path exists for.
      const upstream = await startUpstream();
      vi.stubEnv('SENTRY_DSN', upstream.dsn);
      const extension = new AwsLambdaExtension();
      const url = await startTunnel(extension);
      const envelope = `{"dsn":"${upstream.dsn}"}\n{"type":"event"}\n${'x'.repeat(size)}\n`;
      const body = new Uint8Array(await promisify(gzip)(Buffer.from(envelope)));

      const res = await fetch(`${url}/envelope`, {
        method: 'POST',
        body,
        headers: { 'content-encoding': 'gzip' },
      });
      await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

      expect(res.status).toBe(200);
      expect(upstream.received).toHaveLength(1);
      expect(upstream.encodings).toEqual(['gzip']);
    },
  );

  test('refuses to inflate a body far past the envelope header, rather than exhausting the sandbox', async () => {
    // The extension shares the function's memory limit, so an unbounded inflate is an OOM the
    // platform reports as `Extension.Crash` against the invocation in flight. Measured without the
    // bound: a 611KiB body expanding 1029:1 drove RSS to 3.1GiB.
    const upstream = await startUpstream();
    vi.stubEnv('SENTRY_DSN', upstream.dsn);
    const extension = new AwsLambdaExtension();
    const url = await startTunnel(extension);
    // The bound applies to the header, which is all this ever inflates — so the body that trips it
    // is one with no newline in reach, not one that is merely large.
    const bomb = new Uint8Array(await promisify(gzip)(Buffer.alloc(ENVELOPE_HEADER_MAX_BYTES * 64, 0x20)));

    const res = await fetch(`${url}/envelope`, {
      method: 'POST',
      body: bomb,
      headers: { 'content-encoding': 'gzip' },
    });

    expect(res.status).toBe(500);
    expect(upstream.received).toHaveLength(0);
    // Silent loss is what this whole change is about, so a dropped envelope has to be visible —
    // and it has to be the bound that rejected it, not the parse failing on whatever inflated.
    // `objectContaining` earns its exception here: the error is Node's, and only its `code` is
    // ours to assert — it proves the bound rejected the body rather than the parse failing later.
    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: an envelope could not be read and was dropped.',
      new Error('The envelope header is longer than this extension will inflate to read it'),
    );
  });

  test('stops reporting dropped envelopes long before it stops dropping them', async () => {
    // A Sentry outage or a malformed producer must not bill the customer one CloudWatch line per
    // envelope for the life of the environment.
    const url = await startTunnel();
    const drops = MAX_REPORTED_FAILURES + 5;

    for (let i = 0; i < drops; i++) {
      const res = await fetch(`${url}/envelope`, { method: 'POST', body: 'not json\n{}' });
      expect(res.status).toBe(500);
    }

    expect(errorSpy).toHaveBeenCalledTimes(MAX_REPORTED_FAILURES);
  });

  test('does not put an unparseable envelope DSN into the log', async () => {
    // `makeDsn` reports a bad DSN through an ungated `console.error`, so the header's text reaches
    // stderr verbatim — and a newline in it forges a CloudWatch line.
    const url = await startTunnel();
    const forged = 'bad\nFORGED LINE\nstill-bad';

    const res = await fetch(`${url}/envelope`, {
      method: 'POST',
      body: `{"dsn":"${forged.replace(/\n/g, '\\n')}"}\n{"type":"event"}\n{}`,
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Invalid DSN' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('rejects an envelope carrying a DSN the extension was not given, and forwards nothing', async () => {
    // The allowlist is this tunnel's SSRF protection: it listens on a port inside the customer's
    // execution environment, so a DSN it accepts is a host it will make an outbound request to.
    const upstream = await startUpstream();
    vi.stubEnv('SENTRY_DSN', upstream.dsn);
    const extension = new AwsLambdaExtension();
    const url = await startTunnel(extension);

    const res = await fetch(`${url}/envelope`, {
      method: 'POST',
      body: envelope('https://attacker@evil.example.com/1'),
    });
    await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'DSN not allowed' });
    expect(upstream.received).toHaveLength(0);
  });

  test.each([
    ['a path that is not /envelope', 'GET', '/', undefined, 404, { error: 'Not found' }],
    ['a method that is not POST', 'GET', '/envelope', undefined, 404, { error: 'Not found' }],
    [
      'an envelope header with no dsn',
      'POST',
      '/envelope',
      '{}\n{"type":"event"}',
      400,
      {
        error: 'Invalid envelope: missing DSN',
      },
    ],
    // `JSON.parse` succeeds for every JSON literal, so the header can be any of these at runtime
    // however it is typed.
    [
      'an envelope header that is a JSON null',
      'POST',
      '/envelope',
      'null\n{}',
      400,
      {
        error: 'Invalid envelope: missing DSN',
      },
    ],
    [
      'an envelope header that is a JSON number',
      'POST',
      '/envelope',
      '123\n{}',
      400,
      {
        error: 'Invalid envelope: missing DSN',
      },
    ],
    [
      'an envelope header that is not JSON',
      'POST',
      '/envelope',
      'not json\n{}',
      500,
      {
        error: 'Error tunneling to Sentry',
      },
    ],
    [
      'an envelope carrying an unparseable DSN',
      'POST',
      '/envelope',
      '{"dsn":"nonsense"}\n{}',
      403,
      {
        error: 'Invalid DSN',
      },
    ],
  ])('answers %s with the documented status', async (_label, method, path, body, status, payload) => {
    const url = await startTunnel();

    const res = await fetch(`${url}${path}`, { method, body });

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(payload);
  });

  test('re-arms the shutdown drain from a request it actually took', async () => {
    // `_lastActivityAt` is written by the request handler and read by the drain. A test that sets
    // the field itself leaves the only production writer uncovered, and without it the drain
    // returns on the bare grace and drops whatever the runtime posts during its SIGTERM window.
    const extension = new AwsLambdaExtension();
    const url = await startTunnel(extension);
    const startedAt = Date.now();

    setTimeout(() => void fetch(`${url}/not-an-envelope`).catch(() => undefined), SHUTDOWN_IDLE_GRACE_MS / 2);
    await extension.drainPendingUploads(startedAt + SHUTDOWN_BUDGET_MS);

    expect(Date.now() - startedAt).toBeGreaterThan(SHUTDOWN_IDLE_GRACE_MS + 50);
  });

  test('warns rather than errors when SENTRY_DSN is unset, and says so in one argument', async () => {
    // Advice, not a failure: an alarm filtering on ERROR must not fire, and a second argument
    // would be rendered into the line as a trailing `undefined`.
    await startTunnel();

    expect(warnSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: SENTRY_DSN is not set or is invalid. The /envelope tunnel will forward ' +
        'any DSN in the envelope header without allowlist validation. Set SENTRY_DSN to the same DSN as ' +
        'your SDK to restrict outbound requests.',
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('waits for an envelope the tunnel is still forwarding', async () => {
    // An upload in flight when the environment is torn down is simply lost, so the drain has to
    // outlast it rather than return the moment the tunnel has answered the SDK.
    let upstreamRespondedAt = 0;
    const upstreamPort = await listen(
      track(
        http.createServer((_req, res) => {
          setTimeout(() => {
            upstreamRespondedAt = Date.now();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
          }, UPSTREAM_HOLD_MS);
        }),
      ),
      '127.0.0.1',
    );
    const dsn = `http://public@127.0.0.1:${upstreamPort}/1`;
    vi.stubEnv('SENTRY_DSN', dsn);

    const extension = new AwsLambdaExtension();
    const tunnel = track(extension.startSentryTunnel(0));
    await new Promise<void>(resolve => tunnel.once('listening', resolve));
    const tunnelPort = (tunnel.address() as AddressInfo).port;

    const tunnelled = await fetch(`http://127.0.0.1:${tunnelPort}/envelope`, {
      method: 'POST',
      body: `{"dsn":"${dsn}"}\n{"type":"event"}\n{}`,
    });
    expect(tunnelled.status).toBe(200);

    await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

    // Read at the instant the drain returned: still zero means it walked away from the upload.
    expect(upstreamRespondedAt).toBeGreaterThan(0);
  });

  test('reports a tunnel that cannot listen instead of ending the process', async () => {
    // The extension is already registered by this point, and a process that ends outside the
    // shutdown phase is reported as `Extension.Crash` against the invocation in flight — failing
    // the customer's request over a tunnel only this SDK would have used.
    // Bound the way the tunnel binds — every interface — so the port really is taken from it.
    const takenPort = await listen(track(http.createServer()));
    const exitSpy = spyOnExit();

    const tunnel = track(new AwsLambdaExtension().startSentryTunnel(takenPort));
    const listenError = await new Promise<Error>(resolve => tunnel.once('error', resolve));

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: the envelope tunnel could not listen.',
      listenError,
    );
  });
});

/**
 * Long enough for a collapsed deadline to fire — the slowest measured took about 10ms — and
 * short enough that the test costs roughly the round trip it already pays for.
 */
