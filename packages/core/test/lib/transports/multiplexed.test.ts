import type {
  BaseTransportOptions,
  ClientReport,
  EventEnvelope,
  EventItem,
  TransactionEvent,
  Transport,
} from '@sentry/types';
import { createClientReportEnvelope, createEnvelope, dsnFromString, parseEnvelope } from '@sentry/utils';

import { createTransport, getEnvelopeEndpointWithUrlEncodedAuth, makeMultiplexedTransport } from '../../../src';
import {
  SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY,
  eventFromEnvelope,
  makeSimpleMultiplexedTransport,
} from '../../../src/transports/multiplexed';

const DSN1 = 'https://1234@5678.ingest.sentry.io/4321';
const DSN1_URL = getEnvelopeEndpointWithUrlEncodedAuth(dsnFromString(DSN1)!);

const DSN2 = 'https://5678@1234.ingest.sentry.io/8765';
const DSN2_URL = getEnvelopeEndpointWithUrlEncodedAuth(dsnFromString(DSN2)!);

const ERROR_EVENT = { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' };
const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, ERROR_EVENT] as EventItem,
]);

const TRANSACTION_EVENT: TransactionEvent = { type: 'transaction', event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' };
const TRANSACTION_ENVELOPE = createEnvelope<EventEnvelope>(
  { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
  [[{ type: 'transaction' }, TRANSACTION_EVENT] as EventItem],
);

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

const CLIENT_REPORT_ENVELOPE = createClientReportEnvelope(
  DEFAULT_DISCARDED_EVENTS,
  'https://public@dsn.ingest.sentry.io/1337',
  123456,
);

type Assertion = (url: string, release: string | undefined, body: string | Uint8Array) => void;

const createTestTransport = (...assertions: Assertion[]): ((options: BaseTransportOptions) => Transport) => {
  return (options: BaseTransportOptions) =>
    createTransport(options, request => {
      return new Promise(resolve => {
        const assertion = assertions.shift();
        if (!assertion) {
          throw new Error('No assertion left');
        }

        const event = eventFromEnvelope(parseEnvelope(request.body), ['event']);

        assertion(options.url, event?.release, request.body);
        resolve({ statusCode: 200 });
      });
    });
};

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
};

describe('makeMultiplexedTransport', () => {
  it('Falls back to options DSN when no match', async () => {
    expect.assertions(1);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN1_URL);
      }),
      () => [],
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(ERROR_ENVELOPE);
  });

  it('Falls back to options DSN when a matched DSN is invalid', async () => {
    // Hide warning logs in the test
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect.assertions(1);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN1_URL);
      }),
      () => ['invalidDsn'],
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(ERROR_ENVELOPE);

    jest.clearAllMocks();
  });

  it('DSN can be overridden via match callback', async () => {
    expect.assertions(1);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN2_URL);
      }),
      () => [DSN2],
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(ERROR_ENVELOPE);
  });

  it('DSN and release can be overridden via match callback', async () => {
    expect.assertions(2);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport((url, release) => {
        expect(url).toBe(DSN2_URL);
        expect(release).toBe('something@1.0.0');
      }),
      () => [{ dsn: DSN2, release: 'something@1.0.0' }],
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(ERROR_ENVELOPE);
  });

  it('match callback can return multiple DSNs', async () => {
    expect.assertions(2);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(
        url => {
          expect(url).toBe(DSN1_URL);
        },
        url => {
          expect(url).toBe(DSN2_URL);
        },
      ),
      () => [DSN1, DSN2],
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(ERROR_ENVELOPE);
  });

  it('callback getEvent returns event', async () => {
    expect.assertions(3);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN2_URL);
      }),
      ({ envelope, getEvent }) => {
        expect(envelope).toBe(ERROR_ENVELOPE);
        expect(getEvent()).toBe(ERROR_EVENT);
        return [DSN2];
      },
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(ERROR_ENVELOPE);
  });

  it('callback getEvent returns undefined if not event', async () => {
    expect.assertions(2);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN2_URL);
      }),
      ({ getEvent }) => {
        expect(getEvent()).toBeUndefined();
        return [DSN2];
      },
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(CLIENT_REPORT_ENVELOPE);
  });

  it('callback getEvent ignores transactions by default', async () => {
    expect.assertions(2);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN2_URL);
      }),
      ({ getEvent }) => {
        expect(getEvent()).toBeUndefined();
        return [DSN2];
      },
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(TRANSACTION_ENVELOPE);
  });

  it('callback getEvent can define envelope types', async () => {
    expect.assertions(2);

    const makeTransport = makeMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN2_URL);
      }),
      ({ getEvent }) => {
        expect(getEvent(['event', 'transaction'])).toBe(TRANSACTION_EVENT);
        return [DSN2];
      },
    );

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(TRANSACTION_ENVELOPE);
  });
});

describe('makeSimpleMultiplexedTransport()', () => {
  it('sends events to targets provided in event.extra[SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY]', async () => {
    expect.assertions(2);

    const makeTransport = makeSimpleMultiplexedTransport(
      createTestTransport(
        url => {
          expect(url).toBe(DSN1_URL);
        },
        url => {
          expect(url).toBe(DSN2_URL);
        },
      ),
    );

    const envelope = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
      [
        { type: 'event' },
        {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
          extra: {
            [SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY]: [DSN1, DSN2],
          },
        },
      ] as EventItem,
    ]);

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(envelope);
  });

  it('sends events to default DSN if event.extra[SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY] is not set', async () => {
    expect.assertions(1);

    const makeTransport = makeSimpleMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN1_URL);
      }),
    );

    const envelope = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
      [
        { type: 'event' },
        {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        },
      ] as EventItem,
    ]);

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(envelope);
  });

  it('sends events to default DSN if event.extra[SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY] is an empty array', async () => {
    expect.assertions(1);

    const makeTransport = makeSimpleMultiplexedTransport(
      createTestTransport(url => {
        expect(url).toBe(DSN1_URL);
      }),
    );

    const envelope = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
      [
        { type: 'event' },
        {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
          extra: {
            [SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY]: [],
          },
        },
      ] as EventItem,
    ]);

    const transport = makeTransport({ url: DSN1_URL, ...transportOptions });
    await transport.send(envelope);
  });
});
