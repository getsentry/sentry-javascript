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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.test('sends a client report for dropped events on flush', async () => {
  const clientReports = initWithClientReports();

  getCurrentScope().captureMessage('dropped');
  await close();

  assertEquals(
    clientReports.map(report => report.discarded_events),
    [[{ reason: 'before_send', category: 'error', quantity: 1 }]],
  );
});

Deno.test('sends client reports on the flush interval', async () => {
  const clientReports = initWithClientReports({ clientReportFlushInterval: 50 });

  getCurrentScope().captureMessage('dropped');
  await delay(200);

  assertEquals(
    clientReports.map(report => report.discarded_events),
    [[{ reason: 'before_send', category: 'error', quantity: 1 }]],
  );

  await close();
});

Deno.test('does not send client reports when sendClientReports is false', async () => {
  const clientReports = initWithClientReports({ sendClientReports: false, clientReportFlushInterval: 50 });

  getCurrentScope().captureMessage('dropped');
  await delay(200);
  await close();

  assertEquals(clientReports, []);
});
