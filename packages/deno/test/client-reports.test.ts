import type { ClientReport, Envelope } from '@sentry/core';
import { forEachEnvelopeItem } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { close, getCurrentScope, init } from '../build/esm/index.js';
import type { DenoOptions } from '../build/esm/index.js';
import { makeTestTransport } from './transport.ts';

function initWithClientReports(options: Partial<DenoOptions> = {}): ClientReport[] {
  const clientReports: ClientReport[] = [];
  getCurrentScope().setClient(undefined);
  init({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    defaultIntegrations: false,
    beforeSend: () => null,
    transport: makeTestTransport((envelope: Envelope) => {
      forEachEnvelopeItem(envelope, (item, type) => {
        if (type === 'client_report') {
          clientReports.push(item[1] as ClientReport);
        }
      });
    }),
    ...options,
  });
  return clientReports;
}

async function waitForClientReport(clientReports: ClientReport[]): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (clientReports.length === 0) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for a client report');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

Deno.test('sends client reports on the flush interval', async () => {
  const clientReports = initWithClientReports({ clientReportFlushInterval: 50 });

  getCurrentScope().captureMessage('dropped');
  await waitForClientReport(clientReports);

  assertEquals(
    clientReports.map(report => report.discarded_events),
    [[{ reason: 'before_send', category: 'error', quantity: 1 }]],
  );

  await close();
});

Deno.test('flushes client reports when unload fires', async () => {
  const clientReports = initWithClientReports();

  getCurrentScope().captureMessage('dropped');
  globalThis.dispatchEvent(new Event('unload'));
  await waitForClientReport(clientReports);

  assertEquals(
    clientReports.map(report => report.discarded_events),
    [[{ reason: 'before_send', category: 'error', quantity: 1 }]],
  );

  await close();
});

Deno.test('does not send client reports when sendClientReports is false', async () => {
  const clientReports = initWithClientReports({ sendClientReports: false });

  getCurrentScope().captureMessage('dropped');
  await close();

  assertEquals(clientReports, []);
});
