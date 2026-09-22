import type { Envelope, Event } from '@sentry/core';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it, onTestFinished } from 'vitest';
import { createRunner } from '../../runner';

// Starts an ingest server that never answers envelope requests, so every send stays pending. The Workflow
// posts its result to `/result`, which resolves the returned promise with the posted body.
async function startSilentIngest(): Promise<{ url: string; result: Promise<unknown> }> {
  let resolveResult!: (body: unknown) => void;
  const result = new Promise(resolve => (resolveResult = resolve));

  const server = createServer((req, res) => {
    if (req.url !== '/result') {
      return;
    }
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      res.end();
      resolveResult(JSON.parse(body));
    });
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });

  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, result };
}

it('aborts a send that is still pending when the flush times out', async ({ signal }) => {
  const ingest = await startSilentIngest();

  const runner = createRunner(__dirname)
    .withServerUrl(ingest.url)
    .withWranglerArgs('--var', 'SLOW_INGEST:true')
    .start(signal);

  const result = await runner.makeRequest('get', '/flush-with-timeout');
  expect(result).toEqual({ flushed: false, send: 'aborted' });
});

it('the Workflow from #24482 aborts the pending send of a step when its flush times out', async ({ signal }) => {
  const ingest = await startSilentIngest();

  const runner = createRunner(__dirname)
    .withServerUrl(ingest.url)
    .withWranglerArgs('--var', 'SLOW_INGEST:true', '--var', 'TRACING:true')
    .start(signal);

  await runner.makeRequest('get', '/workflow/trigger');
  expect(await ingest.result).toEqual({ send: 'aborted' });
});

it('delivers events while a user waitUntil task is still running', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.value).toBe('Captured on /pending-wait-until');
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/pending-wait-until');
  await runner.completed();
});
