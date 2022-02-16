import { EventEnvelope } from '@sentry/types';

import { addHeaderToEnvelope, addItemToEnvelope, createEnvelope, serializeEnvelope } from '../src/envelope';

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

  describe('addHeaderToEnvelope()', () => {
    it('adds a header to the envelope', () => {
      const env = createEnvelope({}, []);
      expect(serializeEnvelope(env)).toMatchInlineSnapshot(`"{}"`);
      const newEnv = addHeaderToEnvelope(env, { dsn: 'https://public@example.com/' });
      expect(serializeEnvelope(newEnv)).toMatchInlineSnapshot(`"{\\"dsn\\":\\"https://public@example.com/\\"}"`);
    });
  });

  describe('addItemToEnvelope()', () => {
    const env = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, []);
    expect(serializeEnvelope(env)).toMatchInlineSnapshot(
      `"{\\"event_id\\":\\"aa3ff046696b4bc6b609ce6d28fde9e2\\",\\"sent_at\\":\\"123\\"}"`,
    );
    const newEnv = addItemToEnvelope<EventEnvelope>(env, [
      { type: 'event' },
      { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' },
    ]);
    expect(serializeEnvelope(newEnv)).toMatchInlineSnapshot(`
      "{\\"event_id\\":\\"aa3ff046696b4bc6b609ce6d28fde9e2\\",\\"sent_at\\":\\"123\\"}
      {\\"type\\":\\"event\\"}
      {\\"event_id\\":\\"aa3ff046696b4bc6b609ce6d28fde9e2\\"}"
    `);
  });
});
