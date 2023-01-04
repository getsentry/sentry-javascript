import type { ClientReport } from '@sentry/types';
import { TextDecoder, TextEncoder } from 'util';

import { createClientReportEnvelope } from '../src/clientreport';
import { parseEnvelope, serializeEnvelope } from '../src/envelope';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_DISCARDED_EVENTS: ClientReport['discarded_events'] = [
  {
    reason: 'before_send',
    category: 'error',
    quantity: 30,
  },
  {
    reason: 'network_error',
    category: 'transaction',
    quantity: 23,
  },
];

const MOCK_DSN = 'https://public@example.com/1';

describe('createClientReportEnvelope', () => {
  const testTable: Array<
    [string, Parameters<typeof createClientReportEnvelope>[0], Parameters<typeof createClientReportEnvelope>[1]]
  > = [
    ['with no discard reasons', [], undefined],
    ['with a dsn', [], MOCK_DSN],
    ['with discard reasons', DEFAULT_DISCARDED_EVENTS, MOCK_DSN],
  ];
  it.each(testTable)('%s', (_: string, discardedEvents, dsn) => {
    const env = createClientReportEnvelope(discardedEvents, dsn);

    expect(env[0]).toEqual(dsn ? { dsn } : {});

    const items = env[1];
    expect(items).toHaveLength(1);
    const clientReportItem = items[0];

    expect(clientReportItem[0]).toEqual({ type: 'client_report' });
    expect(clientReportItem[1]).toEqual({ timestamp: expect.any(Number), discarded_events: discardedEvents });
  });

  it('serializes an envelope', () => {
    const env = createClientReportEnvelope(DEFAULT_DISCARDED_EVENTS, MOCK_DSN, 123456);

    const [headers, items] = parseEnvelope(serializeEnvelope(env, encoder), encoder, decoder);

    expect(headers).toEqual({ dsn: 'https://public@example.com/1' });
    expect(items).toEqual([
      [
        { type: 'client_report' },
        {
          timestamp: 123456,
          discarded_events: [
            { reason: 'before_send', category: 'error', quantity: 30 },
            { reason: 'network_error', category: 'transaction', quantity: 23 },
          ],
        },
      ],
    ]);
  });
});
