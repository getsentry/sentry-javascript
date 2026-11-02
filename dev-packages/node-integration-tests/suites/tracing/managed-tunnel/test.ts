import { URL_PATH } from '@sentry/conventions/attributes';
import { getTunnelPath } from '@sentry/core';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as net from 'net';
import { afterAll, describe, expect, vi } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

interface FakeIngest {
  port: number;
  /** Uploads the tunnel started to Sentry. */
  uploads: number;
  /** Envelopes Sentry received in full and answered. */
  delivered: string[];
  /** Uploads that broke off before the whole envelope arrived. */
  brokenUploads: number;
  close(): Promise<void>;
}

/**
 * A Sentry ingest that answers late, so the browser can leave while the tunnel waits on it.
 */
async function startFakeIngest(): Promise<FakeIngest> {
  const delivered: string[] = [];
  let uploads = 0;
  let brokenUploads = 0;
  const server = http.createServer((request, response) => {
    uploads++;
    const chunks: Buffer[] = [];
    let ended = false;
    request.on('data', chunk => chunks.push(chunk));
    request.on('close', () => {
      if (!ended) {
        brokenUploads++;
      }
    });
    request.on('end', () => {
      ended = true;
      setTimeout(() => {
        // The tunnel gave up on the forward.
        if (request.socket.destroyed) {
          return;
        }
        response.end('{}');
        delivered.push(Buffer.concat(chunks).toString());
      }, 300);
    });
  });
  await new Promise<void>(resolve => server.listen(0, resolve));

  return {
    port: (server.address() as AddressInfo).port,
    delivered,
    get uploads() {
      return uploads;
    },
    get brokenUploads() {
      return brokenUploads;
    },
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

/**
 * Posts the first `sentLength` characters of `body` to the tunnel like a browser would, then leaves once the tunnel
 * started the upload to Sentry, before it answers.
 */
async function postAndLeave(
  port: number,
  path: string,
  body: string,
  ingest: FakeIngest,
  sentLength = body.length,
): Promise<void> {
  const socket = await new Promise<net.Socket>(resolve => {
    const connection = net.connect(port, 'localhost', () => resolve(connection));
  });
  socket.write(
    `POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/x-sentry-envelope\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n`,
  );
  socket.write(body.slice(0, sentLength));
  // Leaving earlier would only test the tunnel rejecting a body that broke off before it contacted Sentry.
  await vi.waitUntil(() => ingest.uploads > 0, { timeout: 5_000 });
  socket.destroy();
}

function makeEnvelope(dsn: string, message: string): string {
  return [JSON.stringify({ dsn }), JSON.stringify({ type: 'event' }), JSON.stringify({ message })].join('\n');
}

describe('managed tunnel', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('answers tunnel requests before the app, without a server span', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            // Spans flush in order, so a span for the tunnel request would arrive in this container or before it.
            const segmentPaths = container.items.filter(item => item.is_segment).map(item => item.attributes[URL_PATH]);
            expect(segmentPaths).toEqual([{ type: 'string', value: '/after-tunnel' }]);
          },
        })
        .start();

      // The tunnel rejects the empty body. The app would have answered with a 200.
      await runner.makeRequest('post', getTunnelPath('https://public@dsn.ingest.sentry.io/1337')!, {
        expectError: true,
      });
      await runner.makeRequest('get', '/after-tunnel');

      await runner.completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'server-forward.mjs', 'instrument-forward.mjs', (createRunner, test) => {
    test('delivers an envelope it received in full after the browser leaves', async () => {
      const ingest = await startFakeIngest();
      const dsn = `http://public@localhost:${ingest.port}/1337`;
      const runner = createRunner()
        .withEnv({ INGEST_PORT: String(ingest.port) })
        .start();

      try {
        expect(await runner.makeRequest<string>('get', '/')).toBe('app');
        await postAndLeave(runner.getPort()!, getTunnelPath(dsn)!, makeEnvelope(dsn, 'sent in full'), ingest);

        await vi.waitUntil(() => ingest.delivered.length > 0, { timeout: 5_000 });
        expect(ingest.delivered[0]).toContain('sent in full');
      } finally {
        runner.sendSignal('SIGTERM');
        await ingest.close();
      }
    });

    test('breaks off the forward when the browser leaves mid-upload', async () => {
      const ingest = await startFakeIngest();
      const dsn = `http://public@localhost:${ingest.port}/1337`;
      const runner = createRunner()
        .withEnv({ INGEST_PORT: String(ingest.port) })
        .start();
      const envelope = makeEnvelope(dsn, 'a'.repeat(64 * 1024));

      try {
        expect(await runner.makeRequest<string>('get', '/')).toBe('app');
        await postAndLeave(runner.getPort()!, getTunnelPath(dsn)!, envelope, ingest, 1024);

        await vi.waitUntil(() => ingest.brokenUploads > 0, { timeout: 5_000 });
        expect(ingest.delivered).toEqual([]);
      } finally {
        runner.sendSignal('SIGTERM');
        await ingest.close();
      }
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'server-intercept-false.mjs',
    'instrument-intercept-false.mjs',
    (createRunner, test) => {
      test('records nothing for tunnel requests the app answers, and keeps their scope data isolated', async () => {
        const runner = createRunner()
          .unordered()
          .expect({
            span: container => {
              const segmentPaths = container.items
                .filter(item => item.is_segment)
                .map(item => item.attributes[URL_PATH]);
              expect(segmentPaths).toEqual([{ type: 'string', value: '/after-tunnel' }]);
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('after tunnel');
              expect(event.user?.id).toBeUndefined();
            },
          })
          .start();

        await runner.makeRequest('post', getTunnelPath('https://public@dsn.ingest.sentry.io/1337')!);
        await runner.makeRequest('get', '/after-tunnel');

        await runner.completed();
      });
    },
  );
});
