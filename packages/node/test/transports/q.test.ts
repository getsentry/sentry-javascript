/// <reference lib="es2020" />

/* eslint-disable @typescript-eslint/unbound-method */

import { Session } from '@sentry/hub';
import { Event, SessionAggregates, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';

import { QTransport } from '../../src/transports';

const mockSetEncoding = jest.fn();
let mockReturnCode = 200;
let mockHeaders = {};

const mockEventPayload: Event = {
  type: 'event',
};
const mockTransactionPayload: Event = {
  type: 'transaction',
};
const mockSessionPayload = new Session({});
const mockSessionsPayload: SessionAggregates = {
  aggregates: [],
};

const parseEnvelope = (body: any) => {
  const [envelopeHeaderString, itemHeaderString, itemString] = body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    item: JSON.parse(itemString),
  };
};

const endMock = jest.fn().mockImplementation((_body, callback) => {
  setImmediate(() => {
    callback({
      headers: mockHeaders,
      setEncoding: mockSetEncoding,
      statusCode: mockReturnCode,
      on: jest.fn(),
    });
  });
});

function createTransport(options: Partial<TransportOptions> = {}): QTransport {
  const transport = new QTransport({
    ...options,
    dsn: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
  });

  transport.module = {
    request: jest.fn().mockImplementation((_options: any, callback: any) => ({
      end: (body: any) => {
        return endMock(body, callback);
      },
      on: jest.fn(),
    })),
  };
  return transport;
}

describe('QTransport', () => {
  beforeEach(() => {
    mockReturnCode = 200;
    mockHeaders = {};
    jest.clearAllMocks();
  });

  describe('Request buffering', () => {
    test('Accepts all events when buffer is not full', async () => {
      const transport = createTransport({
        bufferSize: 3,
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockTransactionPayload),
          transport.sendSession(mockSessionPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
      ]);
    });

    test('Queues events when buffer is full', async () => {
      const transport = createTransport({
        bufferSize: 1,
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockTransactionPayload),
          transport.sendSession(mockSessionPayload),
          transport.sendSession(mockSessionsPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
      ]);
    });

    test('Rejects an event when buffer and corresponding event type queue is full', async () => {
      const transport = createTransport({
        bufferSize: 2,
        queueSize: {
          event: 1,
        },
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockEventPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing event request: Queue is full') },
      ]);
    });

    test('Queue event of a different type, when when buffer and other queues are full', async () => {
      const transport = createTransport({
        bufferSize: 3,
        queueSize: {
          event: 2,
          transaction: 1,
          session: 1,
        },
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(mockTransactionPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendSession(mockSessionPayload),
          transport.sendEvent(mockTransactionPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockTransactionPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendEvent(mockEventPayload),
          transport.sendSession(mockSessionPayload),
          transport.sendSession(mockSessionsPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing transaction request: Queue is full') },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing event request: Queue is full') },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing session request: Queue is full') },
      ]);
    });

    test('Sends queued requests after buffer frees up', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);

      expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(4);
        done();
      });
    });

    test('Sends queued requests of different type, one of each after buffer frees up', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendSession(mockSessionPayload);
      void transport.sendSession(mockSessionPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);

      expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(parseEnvelope(endMock.mock.calls[3][0]).itemHeader.type).toEqual('session');

        setImmediate(() => {
          expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(6);
          expect(JSON.parse(endMock.mock.calls[4][0]).type).toEqual('event');
          expect(parseEnvelope(endMock.mock.calls[5][0]).itemHeader.type).toEqual('session');

          setImmediate(() => {
            done();
          });
        });
      });
    });

    test('Sends queued requests of different type, one of each, and drains the rest when theres no more of other types', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendSession(mockSessionPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);

      expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(parseEnvelope(endMock.mock.calls[3][0]).itemHeader.type).toEqual('session');

        setImmediate(() => {
          expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(6);
          expect(JSON.parse(endMock.mock.calls[4][0]).type).toEqual('event');
          expect(JSON.parse(endMock.mock.calls[5][0]).type).toEqual('event');

          setImmediate(() => {
            done();
          });
        });
      });
    });

    test('Sends queued requests in a predefined priority order, despite queueing order (event > transaction > session)', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);
      void transport.sendSession(mockSessionPayload);
      void transport.sendEvent(mockTransactionPayload);
      void transport.sendEvent(mockEventPayload);

      expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(parseEnvelope(endMock.mock.calls[3][0]).itemHeader.type).toEqual('transaction');

        setImmediate(() => {
          expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(5);
          expect(parseEnvelope(endMock.mock.calls[4][0]).itemHeader.type).toEqual('session');

          setImmediate(() => {
            done();
          });
        });
      });
    });

    test('Remembers what queue to get event from (state-machine-like)', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      // fill buffer
      void transport.sendEvent(mockEventPayload);
      void transport.sendEvent(mockEventPayload);

      // queue event
      void transport.sendEvent(mockEventPayload);

      expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        // fill buffer again
        void transport.sendEvent(mockEventPayload);

        expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(JSON.parse(endMock.mock.calls[3][0]).type).toEqual('event');

        // queue events, this time it should start from transaction first, as event was picked up previously
        void transport.sendEvent(mockTransactionPayload);
        void transport.sendEvent(mockEventPayload);

        setImmediate(() => {
          expect(transport.module!.request as jest.Mock).toHaveBeenCalledTimes(6);
          expect(parseEnvelope(endMock.mock.calls[4][0]).itemHeader.type).toEqual('transaction');
          expect(JSON.parse(endMock.mock.calls[5][0]).type).toEqual('event');

          setImmediate(() => {
            done();
          });
        });
      });
    });
  });
});
