import * as net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { POLL_KEEPALIVE_MS } from '../../src/lambda-extension/constants';
import { request } from '../../src/lambda-extension/extensions-api';
import { collapseEveryDeadline, startServer } from './helpers';

const POLL_DEADLINE_GRACE_MS = 50;

/**
 * Rewrites every deadline primitive so that whatever duration is asked for expires at once. A
 * request that arms no deadline is untouched; one that arms any is over before the next line runs.
 */

describe('request', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('holds the poll open rather than putting a deadline on it', async () => {
    // "Do not set a timeout on the GET call, as the extension can be suspended for a period of
    // time until there is an event to return." Naming one timeout API and asserting it went
    // unused would miss the others — and a socket deadline on its own is harmless anyway, it only
    // emits `'timeout'`. So instead every deadline the call arms is made to expire immediately:
    // whatever would eventually end the poll ends it here, before the event arrives.
    let respond: (() => void) | undefined;
    let polling!: () => void;
    const reachedServer = new Promise<void>(resolve => (polling = resolve));
    const api = await startServer((_req, res) => {
      respond = () => {
        res.writeHead(200);
        res.end('{}');
      };
      polling();
    });

    collapseEveryDeadline();

    let settlement: string | undefined;
    const polled = request(api.url, { headers: {} });
    void polled.then(
      () => (settlement = 'resolved'),
      (err: Error) => (settlement = `rejected with ${err.message}`),
    );

    // The grace only means something once the poll is parked at the server, and a poll that dies
    // before it gets there has already lost.
    await Promise.race([reachedServer, polled.catch(() => {})]);
    // Counted off the real clock: `globalThis.setTimeout` is collapsed for the duration.
    await delay(POLL_DEADLINE_GRACE_MS);

    expect(settlement).toBeUndefined();

    respond?.();
    const answered = await polled;
    expect(answered.statusCode).toBe(200);
    expect(answered.body).toBe('{}');

    await api.close();
  });

  test('rejects when the peer goes away mid-poll', async () => {
    // The poll has no deadline on purpose — it spans the environment's frozen idle time, which
    // is unbounded — so a peer that disappears has to surface as a socket error instead.
    const peer = await startServer();
    peer.server.on('connection', socket => socket.destroy());

    await expect(request(peer.url, { headers: {} })).rejects.toThrow();

    await peer.close();
  });

  test('enables TCP keep-alive so a dead peer is detected without a deadline', async () => {
    const api = await startServer((_req, res) => {
      res.writeHead(200);
      res.end('{}');
    });
    const setKeepAlive = vi.spyOn(net.Socket.prototype, 'setKeepAlive');

    await request(api.url, { headers: {} });

    expect(setKeepAlive).toHaveBeenCalledWith(true, POLL_KEEPALIVE_MS);

    await api.close();
  });

  test('sends a POST body and hands back the response headers, which registration needs', async () => {
    let seen: { method?: string; body?: string } = {};
    const api = await startServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        seen = { method: req.method, body: Buffer.concat(chunks).toString() };
        res.writeHead(200, { 'lambda-extension-identifier': 'an-id' });
        res.end('{}');
      });
    });

    const res = await request(api.url, { method: 'POST', headers: {}, body: '{"events":["SHUTDOWN"]}' });

    expect(seen).toEqual({ method: 'POST', body: '{"events":["SHUTDOWN"]}' });
    expect(res.headers['lambda-extension-identifier']).toBe('an-id');

    await api.close();
  });
});
