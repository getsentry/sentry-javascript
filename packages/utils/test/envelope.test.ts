import { TextDecoder, TextEncoder } from 'util';
import type { DsnComponents, DynamicSamplingContext, Event, EventEnvelope } from '@sentry/types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

import {
  addItemToEnvelope,
  createEnvelope,
  createEventEnvelope,
  forEachEnvelopeItem,
  parseEnvelope,
  serializeEnvelope,
} from '../src/envelope';

describe('envelope', () => {
  describe('createEnvelope()', () => {
    const testTable: Array<[string, Parameters<typeof createEnvelope>[0], Parameters<typeof createEnvelope>[1]]> = [
      ['creates an empty envelope', {}, []],
      ['creates an envelope with a header but no items', { dsn: 'https://public@example.com/1', sdk: {} }, []],
    ];
    it.each(testTable)('%s', (_: string, headers, items) => {
      const env = createEnvelope(headers, items);
      expect(env).toHaveLength(2);
      expect(env[0]).toStrictEqual(headers);
      expect(env[1]).toStrictEqual(items);
    });
  });

  describe('createEventEnvelope', () => {
    const testDsn: DsnComponents = { protocol: 'https', projectId: 'abc', host: 'testry.io', publicKey: 'pubKey123' };

    describe('trace header', () => {
      const testTable: Array<[string, Event, DynamicSamplingContext]> = [
        [
          'adds minimal baggage items',
          {
            type: 'transaction',
            sdkProcessingMetadata: {
              dynamicSamplingContext: { trace_id: '1234', public_key: 'pubKey123' },
            },
          },
          { trace_id: '1234', public_key: 'pubKey123' },
        ],
        [
          'adds multiple baggage items',
          {
            type: 'transaction',
            sdkProcessingMetadata: {
              dynamicSamplingContext: {
                environment: 'prod',
                release: '1.0.0',
                public_key: 'pubKey123',
                trace_id: '1234',
              },
            },
          },
          { release: '1.0.0', environment: 'prod', trace_id: '1234', public_key: 'pubKey123' },
        ],
        [
          'adds all baggage items',
          {
            type: 'transaction',
            sdkProcessingMetadata: {
              dynamicSamplingContext: {
                environment: 'prod',
                release: '1.0.0',
                transaction: 'TX',
                user_segment: 'segmentA',
                sample_rate: '0.95',
                public_key: 'pubKey123',
                trace_id: '1234',
              },
            },
          },
          {
            environment: 'prod',
            release: '1.0.0',
            transaction: 'TX',
            user_segment: 'segmentA',
            sample_rate: '0.95',
            public_key: 'pubKey123',
            trace_id: '1234',
          },
        ],
        [
          'with error event',
          {
            sdkProcessingMetadata: {
              dynamicSamplingContext: { trace_id: '1234', public_key: 'pubKey123' },
            },
          },
          { trace_id: '1234', public_key: 'pubKey123' },
        ],
      ];
      it.each(testTable)('%s', (_: string, event, trace) => {
        const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

        expect(envelopeHeaders).toBeDefined();
        expect(envelopeHeaders.trace).toBeDefined();
        expect(envelopeHeaders.trace).toEqual(trace);
      });
    });
  });

  describe('serializeEnvelope and parseEnvelope', () => {
    it('serializes an envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
      const serializedEnvelope = serializeEnvelope(env, encoder);
      expect(typeof serializedEnvelope).toBe('string');

      const [headers] = parseEnvelope(serializedEnvelope, encoder, decoder);
      expect(headers).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
    });

    it('serializes an envelope with attachments', () => {
      const items: EventEnvelope[1] = [
        [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
        [{ type: 'attachment', filename: 'bar.txt', length: 6 }, Uint8Array.from([1, 2, 3, 4, 5, 6])],
        [{ type: 'attachment', filename: 'foo.txt', length: 6 }, Uint8Array.from([7, 8, 9, 10, 11, 12])],
      ];

      const env = createEnvelope<EventEnvelope>(
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
        items,
      );

      expect.assertions(6);

      const serializedEnvelope = serializeEnvelope(env, encoder);
      expect(serializedEnvelope).toBeInstanceOf(Uint8Array);

      const [parsedHeaders, parsedItems] = parseEnvelope(serializedEnvelope, encoder, decoder);
      expect(parsedHeaders).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
      expect(parsedItems).toHaveLength(3);
      expect(items[0]).toEqual([{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }]);
      expect(items[1]).toEqual([
        { type: 'attachment', filename: 'bar.txt', length: 6 },
        Uint8Array.from([1, 2, 3, 4, 5, 6]),
      ]);
      expect(items[2]).toEqual([
        { type: 'attachment', filename: 'foo.txt', length: 6 },
        Uint8Array.from([7, 8, 9, 10, 11, 12]),
      ]);
    });

    it("doesn't throw when being passed a an envelope that contains a circular item payload", () => {
      const chicken: { egg?: any } = {};
      const egg = { chicken } as unknown as Event;
      chicken.egg = chicken;

      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
        [{ type: 'event' }, egg],
      ]);

      const serializedEnvelope = serializeEnvelope(env, encoder);
      const [, , serializedBody] = serializedEnvelope.toString().split('\n');

      expect(serializedBody).toBe('{"chicken":{"egg":"[Circular ~]"}}');
    });
  });

  describe('addItemToEnvelope()', () => {
    it('adds an item to an envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
      let [envHeaders, items] = parseEnvelope(serializeEnvelope(env, encoder), encoder, decoder);
      expect(items).toHaveLength(0);
      expect(envHeaders).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });

      const newEnv = addItemToEnvelope<EventEnvelope>(env, [
        { type: 'event' },
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' },
      ]);

      [envHeaders, items] = parseEnvelope(serializeEnvelope(newEnv, encoder), encoder, decoder);
      expect(envHeaders).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual([{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }]);
    });
  });

  describe('forEachEnvelopeItem', () => {
    it('loops through an envelope', () => {
      const items: EventEnvelope[1] = [
        [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
        [{ type: 'attachment', filename: 'bar.txt', length: 6 }, Uint8Array.from([1, 2, 3, 4, 5, 6])],
        [{ type: 'attachment', filename: 'foo.txt', length: 6 }, Uint8Array.from([7, 8, 9, 10, 11, 12])],
      ];

      const env = createEnvelope<EventEnvelope>(
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
        items,
      );

      expect.assertions(6);

      let iteration = 0;
      forEachEnvelopeItem(env, (item, type) => {
        expect(item).toBe(items[iteration]);
        expect(type).toBe(items[iteration][0].type);
        iteration = iteration + 1;
      });
    });
  });
});
