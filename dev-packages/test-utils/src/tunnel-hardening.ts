// Throws every request we could think of at a server whose runtime answers managed tunnel requests, and checks the
// app keeps serving after each one. The tunnel must never break the app, whatever the client, the envelope or the
// ingest does. Only Node built-ins, so Bun and Deno tests can import this file directly.
import { Buffer } from 'node:buffer';
import * as http from 'node:http';
import * as net from 'node:net';
import * as zlib from 'node:zlib';

type IngestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/**
 * Fake ingests, one per behavior. Their DSNs are allowed tunnel DSNs, so the tunnel forwards to them.
 */
const INGEST_HANDLERS: Record<string, IngestHandler | null> = {
  ok: (req, res) => drain(req, () => res.end('{}')),
  hang: () => undefined,
  reset: req => req.socket.destroy(),
  error500: (req, res) => drain(req, () => res.writeHead(500).end('boom')),
  drip: (_req, res) => {
    res.writeHead(200);
    let n = 0;
    const timer = setInterval(() => (n++ < 20 ? res.write('.') : (clearInterval(timer), res.end())), 20);
    res.on('close', () => clearInterval(timer));
  },
  huge: (_req, res) => res.end(Buffer.alloc(5e6, 'x')),
  earlyReply: (_req, res) => res.writeHead(200).end('{}'),
  resetMidResponse: (req, res) => {
    res.writeHead(200);
    res.write('partial');
    setTimeout(() => req.socket.destroy(), 20);
  },
  // Nothing listens on its port.
  refused: null,
};

export interface FakeIngests {
  /** The DSN of the fake ingest with this behavior. */
  dsn(name: keyof typeof INGEST_HANDLERS): string;
  /** Every fake ingest DSN, for `allowedDsns`. */
  allDsns(): string[];
  close(): Promise<void>;
}

/**
 * Starts the fake ingests on free ports.
 */
export async function startFakeIngests(): Promise<FakeIngests> {
  const servers: http.Server[] = [];
  const sockets = new Set<net.Socket>();
  const ports: Record<string, number> = {};

  for (const [name, handler] of Object.entries(INGEST_HANDLERS)) {
    const server = http.createServer(handler ?? (() => undefined));
    server.on('connection', socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    ports[name] = (server.address() as net.AddressInfo).port;
    if (handler) {
      servers.push(server);
    } else {
      // Keep the port, refuse connections.
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  const dsn = (name: string): string => `http://${name}@127.0.0.1:${ports[name]}/1`;

  return {
    dsn,
    allDsns: () => Object.keys(INGEST_HANDLERS).map(dsn),
    close: async () => {
      sockets.forEach(socket => socket.destroy());
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    },
  };
}

export interface TunnelHardeningOptions {
  /** The port of the app under test. */
  port: number;
  ingests: FakeIngests;
  /** `getTunnelPath` from `@sentry/core`, passed in so this file has no dependencies. */
  getTunnelPath: (dsn: string) => string | undefined;
  /** The app's path prefix, if it serves the tunnel under one. */
  basePath?: string;
  /** Skips cases by name, for runtimes whose HTTP stack rejects them before any JavaScript runs. */
  skip?: string[];
}

export interface TunnelHardeningResult {
  name: string;
  /** The response status(es) the client got, or what happened instead. */
  outcome: string;
  /** The status of a request to the app's `GET /health` right after the case. */
  health: string;
}

/**
 * Runs every case against the app and returns what happened. The app must answer `GET /health` with a 200.
 */
export async function runTunnelHardeningCases(options: TunnelHardeningOptions): Promise<TunnelHardeningResult[]> {
  const results: TunnelHardeningResult[] = [];
  for (const [name, run] of getCases(options)) {
    if (options.skip?.includes(name)) {
      continue;
    }

    const outcome = await run();
    results.push({ name, outcome, health: await request(options.port, 'GET', '/health') });
  }

  return results;
}

/**
 * The outcomes the tunnel itself decides, as opposed to the runtime's HTTP parser, so every runtime should agree.
 */
export const EXPECTED_TUNNEL_OUTCOMES: Record<string, string> = {
  'valid envelope': '200',
  'trailing slash': '200',
  'query string': '200',
  // The browser SDK always sends `Content-Length`, and the forward streams up to it.
  chunked: '411',
  'invalid JSON header': '400',
  'dsn is an object': '400',
  '__proto__ header': '400',
  // A browser compresses item payloads, never the whole envelope.
  'gzip encoded': '400',
  'dsn not allowed': '403',
  'other allowed dsn on this path': '500',
  '2MB body': '200',
  'slow body': '200',
  'pipelined tunnel then app': '200,200',
  'rejected tunnel with a big unread body, then app': '403,200',
  'pipelined app, tunnel, app': '200,200,200',
  'ingest error500': '500',
  'ingest refused': '500',
  'ingest earlyReply': '200',
};

type Case = [name: string, run: () => Promise<string>];

function getCases({ port, ingests, getTunnelPath, basePath = '' }: TunnelHardeningOptions): Case[] {
  const tunnelPath = (name: string): string => `${basePath}${getTunnelPath(ingests.dsn(name))}`;
  const envelope = (name: string, body = '{"type":"event"}\n{"message":"hardening"}\n'): string =>
    `{"dsn":"${ingests.dsn(name)}"}\n${body}`;
  const raw = (chunks: Chunk | Chunk[], rawOptions?: RawOptions): Promise<string> =>
    rawRequest(port, chunks, rawOptions);
  const P = tunnelPath('ok');
  const OK = envelope('ok');

  return [
    // Matching
    ['valid envelope', () => raw(post(P, OK))],
    ['GET tunnel path', () => raw(get(P))],
    ['HEAD tunnel path', () => raw(`HEAD ${P} HTTP/1.1\r\nHost: localhost\r\n\r\n`)],
    ['PUT tunnel path', () => raw(post(P, OK).replace('POST', 'PUT'))],
    ['OPTIONS tunnel path', () => raw(`OPTIONS ${P} HTTP/1.1\r\nHost: localhost\r\n\r\n`)],
    ['OPTIONS *', () => raw('OPTIONS * HTTP/1.1\r\nHost: localhost\r\n\r\n')],
    ['trailing slash', () => raw(post(`${P}/`, OK))],
    ['query string', () => raw(post(`${P}?a=1&b`, OK))],
    ['double slash', () => raw(post(`/${P}`, OK))],
    ['uppercase path', () => raw(post(P.toUpperCase(), OK))],
    [
      'percent-encoded path',
      () =>
        raw(
          post(
            P.replace(/[^/]/g, c => `%${c.charCodeAt(0).toString(16)}`),
            OK,
          ),
        ),
    ],
    ['dot segments', () => raw(post(`/x/..${P}`, OK))],
    ['absolute-form URL', () => raw(post(`http://evil.example${P}`, OK))],
    ['bad Host header', () => raw(post(P, OK).replace('Host: localhost', 'Host: [::bad'))],
    ['no Host header', () => raw(post(P, OK).replace('Host: localhost\r\n', ''))],
    ['HTTP/1.0', () => raw(post(P, OK).replace('HTTP/1.1', 'HTTP/1.0'))],
    ['null byte in path', () => raw(post(`${P}%00`, OK))],
    ['8KB query', () => raw(post(`${P}?${'a'.repeat(8000)}`, OK))],
    // Bodies
    ['empty body', () => raw(post(P, ''))],
    ['no newline', () => raw(post(P, `{"dsn":"${ingests.dsn('ok')}"}`))],
    ['invalid JSON header', () => raw(post(P, '{"dsn":\n{}\n'))],
    ['dsn is a number', () => raw(post(P, '{"dsn":42}\n{}\n'))],
    ['dsn is an array', () => raw(post(P, '{"dsn":["a"]}\n{}\n'))],
    ['dsn is an object', () => raw(post(P, '{"dsn":{"toString":1}}\n{}\n'))],
    ['dsn is null', () => raw(post(P, '{"dsn":null}\n{}\n'))],
    ['header is an array', () => raw(post(P, '[1,2]\n{}\n'))],
    ['header is a string', () => raw(post(P, '"hi"\n{}\n'))],
    ['__proto__ header', () => raw(post(P, `{"__proto__":{"dsn":"${ingests.dsn('ok')}"}}\n{}\n`))],
    ['dsn not allowed', () => raw(post(P, '{"dsn":"https://k@o1.ingest.sentry.io/1"}\n{}\n'))],
    ['dsn garbage string', () => raw(post(P, '{"dsn":"::::"}\n{}\n'))],
    ['other allowed dsn on this path', () => raw(post(P, envelope('error500')))],
    ['70KB header line', () => raw(post(P, `{"dsn":"${ingests.dsn('ok')}","pad":"${'x'.repeat(70_000)}"}\n{}\n`))],
    [
      'binary garbage',
      () => raw(post(P, Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) % 256)).toString('latin1'))),
    ],
    ['invalid UTF-8', () => raw(post(P, '\xff\xfe\xfd\n\xc3\x28\n'))],
    [
      'gzip encoded',
      () => {
        const gzipped = zlib.gzipSync(OK);

        return raw([
          `POST ${P} HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${gzipped.length}\r\nContent-Encoding: gzip\r\n\r\n`,
          gzipped,
        ]);
      },
    ],
    ['gzip header, plain body', () => raw(post(P, OK, 'Content-Encoding: gzip\r\n'))],
    [
      '2MB body',
      () => raw(post(P, envelope('ok', `{"type":"attachment"}\n${'a'.repeat(2e6)}\n`)), { timeoutMs: 10_000 }),
    ],
    ['chunked', () => raw(chunked(P, OK))],
    ['chunked + trailers', () => raw(chunked(P, OK, 'Trailer: X-T\r\n', 'X-T: 1\r\n'))],
    ['bad chunk size', () => raw(`POST ${P} HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\n`)],
    [
      'Content-Length and Transfer-Encoding',
      () =>
        raw(
          `POST ${P} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`,
        ),
    ],
    [
      'duplicate Content-Length',
      () => raw(`POST ${P} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 3\r\nContent-Length: 4\r\n\r\nabcd`),
    ],
    ['Expect: 100-continue', () => raw(post(P, OK, 'Expect: 100-continue\r\n'), { statuses: 2 })],
    [
      'Upgrade: websocket',
      () =>
        raw(
          get(
            P,
            'Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n',
          ),
        ),
    ],
    // Client misbehavior
    [
      'abort before the envelope header ends',
      () => raw(withContentLength(post(P, OK).slice(0, -OK.length + 10), 9999), { closeAfterMs: 100 }),
    ],
    ['abort mid-body', () => raw(withContentLength(post(P, OK), 99_999), { closeAfterMs: 100 })],
    ['Content-Length too large, then wait', () => raw(withContentLength(post(P, OK), 99_999), { timeoutMs: 1500 })],
    ['abort while forwarding', () => raw(post(tunnelPath('hang'), envelope('hang')), { closeAfterMs: 300 })],
    [
      'slow body',
      () =>
        raw(
          [
            withContentLength(post(P, ''), Buffer.byteLength(OK)),
            ...[...OK.match(/.{1,8}/gs)!].flatMap(chunk => [chunk, 20]),
          ],
          { timeoutMs: 10_000 },
        ),
    ],
    ['half-close after body', () => raw(post(P, OK), { endAfterWrite: true })],
    // Keep-alive: the tunnel must leave the connection usable for the app.
    ['pipelined tunnel then app', () => raw(post(P, OK) + get('/health'), { statuses: 2 })],
    [
      'rejected tunnel with a big unread body, then app',
      () =>
        raw(post(P, `{"dsn":"https://k@o1.ingest.sentry.io/1"}\n${'x'.repeat(200_000)}`) + get('/health'), {
          statuses: 2,
        }),
    ],
    ['pipelined app, tunnel, app', () => raw(get('/health') + post(P, OK) + get('/health'), { statuses: 3 })],
    // Ingest misbehavior
    ...(['hang', 'reset', 'error500', 'drip', 'huge', 'earlyReply', 'resetMidResponse', 'refused'] as const).map(
      (name): Case => [
        `ingest ${name}`,
        () => raw(post(tunnelPath(name), envelope(name)), { timeoutMs: name === 'hang' ? 1500 : 8000 }),
      ],
    ),
    // Load
    [
      '100 mixed concurrent requests',
      async () => {
        const jobs = Array.from({ length: 100 }, (_, i) =>
          [
            () => request(port, 'POST', P, OK),
            () => request(port, 'GET', '/health'),
            () => raw(post(tunnelPath('reset'), envelope('reset'))),
            () => raw(post(tunnelPath('hang'), envelope('hang')), { closeAfterMs: 200 }),
          ][i % 4]!(),
        );
        const counts: Record<string, number> = {};
        for (const outcome of await Promise.all(jobs)) {
          counts[outcome] = (counts[outcome] ?? 0) + 1;
        }

        return Object.entries(counts)
          .map(([outcome, count]) => `${outcome}x${count}`)
          .join(' ');
      },
    ],
  ];
}

type Chunk = string | Buffer | number;

interface RawOptions {
  /** Destroys the socket after this many ms. */
  closeAfterMs?: number;
  timeoutMs?: number;
  /** How many response status lines to wait for. */
  statuses?: number;
  /** Half-closes the socket after writing. */
  endAfterWrite?: boolean;
}

/**
 * Writes raw bytes to the app (numbers are pauses in ms) and returns the response status(es), or what happened
 * instead: `aborted by client`, `timeout`, `closed`, or a socket error code.
 */
function rawRequest(
  port: number,
  chunks: Chunk | Chunk[],
  { closeAfterMs, timeoutMs = 3000, statuses = 1, endAfterWrite = false }: RawOptions = {},
): Promise<string> {
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    let settled = false;
    const statusesSoFar = (): string[] => [...data.matchAll(/HTTP\/1\.[01] (\d{3})/g)].map(match => match[1]!);
    const finish = (result: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    };
    const timeout = setTimeout(() => finish(statusesSoFar().join(',') || 'timeout'), timeoutMs);

    socket.on('data', chunk => {
      data += chunk.toString('latin1');
      if (statusesSoFar().length >= statuses) {
        finish(statusesSoFar().join(','));
      }
    });
    socket.on('error', error => finish(`socket ${(error as Error & { code?: string }).code}`));
    socket.on('close', () => finish(statusesSoFar().join(',') || (data ? 'garbled' : 'closed')));
    socket.on('connect', async () => {
      for (const chunk of ([] as Chunk[]).concat(chunks)) {
        if (typeof chunk === 'number') {
          await new Promise(r => setTimeout(r, chunk));
        } else if (!socket.destroyed) {
          socket.write(chunk);
        }
      }
      if (endAfterWrite && !socket.destroyed) {
        socket.end();
      }
      if (closeAfterMs !== undefined) {
        setTimeout(() => finish('aborted by client'), closeAfterMs);
      }
    });
  });
}

/**
 * Makes a request with `fetch` and returns the status, or the error code.
 */
async function request(port: number, method: string, path: string, body?: string): Promise<string> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      body,
      signal: AbortSignal.timeout(5000),
    });
    await response.arrayBuffer();

    return String(response.status);
  } catch (error) {
    return `fetch ${(error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name}`;
  }
}

function post(path: string, body: string, headers = ''): string {
  return `POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${headers}\r\n${body}`;
}

function get(path: string, headers = ''): string {
  return `GET ${path} HTTP/1.1\r\nHost: localhost\r\n${headers}\r\n`;
}

function chunked(path: string, body: string, headers = '', trailers = ''): string {
  return `POST ${path} HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n${headers}\r\n${Buffer.byteLength(body).toString(16)}\r\n${body}\r\n0\r\n${trailers}\r\n`;
}

function withContentLength(rawRequest: string, length: number): string {
  return rawRequest.replace(/Content-Length: \d+/, `Content-Length: ${length}`);
}

function drain(req: http.IncomingMessage, done: () => void): void {
  req.on('data', () => undefined);
  req.on('end', done);
  req.on('error', () => undefined);
}
