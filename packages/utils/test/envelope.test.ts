import { EventEnvelope } from '@sentry/types';

import { addItemToEnvelope, createEnvelope, getEnvelopeType, serializeStringEnvelope } from '../src/envelope';
import { parseEnvelope } from './testutils';

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

  describe('serializeStringEnvelope()', () => {
    it('serializes an envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
      expect(serializeStringEnvelope(env)).toMatchInlineSnapshot(
        '"{\\"event_id\\":\\"aa3ff046696b4bc6b609ce6d28fde9e2\\",\\"sent_at\\":\\"123\\"}"',
      );
    });
  });

  describe('addItemToEnvelope()', () => {
    it('adds an item to an envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
      const parsedEnvelope = parseEnvelope(serializeStringEnvelope(env));
      expect(parsedEnvelope).toHaveLength(1);
      expect(parsedEnvelope[0]).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });

      const newEnv = addItemToEnvelope<EventEnvelope>(env, [
        { type: 'event' },
        { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' },
      ]);
      const parsedNewEnvelope = parseEnvelope(serializeStringEnvelope(newEnv));
      expect(parsedNewEnvelope).toHaveLength(3);
      expect(parsedNewEnvelope[0]).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' });
      expect(parsedNewEnvelope[1]).toEqual({ type: 'event' });
      expect(parsedNewEnvelope[2]).toEqual({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' });
    });
  });

  describe('getEnvelopeType', () => {
    it('returns the type of the envelope', () => {
      const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
        [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
        [{ type: 'attachment', filename: 'me.txt', length: 6 }, new Uint8Array(6)],
      ]);
      expect(getEnvelopeType(env)).toEqual('event');
    });
  });
});
