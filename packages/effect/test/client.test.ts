import { createStackParser, nodeStackLineParser } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { EffectClient } from '../src/client';

const TEST_DSN = 'https://username@domain/123';

const testStackParser = createStackParser(nodeStackLineParser());

function getTestClientOptions() {
  return {
    dsn: TEST_DSN,
    integrations: [],
    transport: () => ({
      send: () => Promise.resolve({}),
      flush: () => Promise.resolve(true),
    }),
    stackParser: testStackParser,
  };
}

describe('EffectClient', () => {
  describe('constructor', () => {
    it('creates an instance with SDK metadata', () => {
      const client = new EffectClient(getTestClientOptions());

      expect(client).toBeInstanceOf(EffectClient);
      expect(client.getOptions().dsn).toBe(TEST_DSN);
    });
  });

  describe('eventFromException', () => {
    it('creates event from Error', async () => {
      const client = new EffectClient(getTestClientOptions());
      const error = new Error('Test error message');
      error.name = 'TestError';

      const event = await client.eventFromException(error);

      expect(event.level).toBe('error');
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.type).toBe('TestError');
      expect(event.exception?.values?.[0]?.value).toBe('Test error message');
    });

    it('creates event from Error with stack trace', async () => {
      const client = new EffectClient(getTestClientOptions());
      const error = new Error('Test error');

      const event = await client.eventFromException(error);

      expect(event.exception?.values?.[0]?.stacktrace).toBeDefined();
    });

    it('creates event from plain object', async () => {
      const client = new EffectClient(getTestClientOptions());
      const obj = { foo: 'bar', baz: 123 };

      const event = await client.eventFromException(obj);

      expect(event.level).toBe('error');
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toContain('Object captured as exception');
      expect(event.exception?.values?.[0]?.value).toContain('foo');
      expect(event.exception?.values?.[0]?.value).toContain('baz');
    });

    it('creates event from primitive value', async () => {
      const client = new EffectClient(getTestClientOptions());

      const event = await client.eventFromException('string error');

      expect(event.level).toBe('error');
      expect(event.exception?.values?.[0]?.value).toBe('string error');
    });

    it('creates event from number', async () => {
      const client = new EffectClient(getTestClientOptions());

      const event = await client.eventFromException(42);

      expect(event.exception?.values?.[0]?.value).toBe('42');
    });

    it('uses event_id from hint if provided', async () => {
      const client = new EffectClient(getTestClientOptions());
      const error = new Error('Test');

      const event = await client.eventFromException(error, { event_id: 'custom-id-123' });

      expect(event.event_id).toBe('custom-id-123');
    });
  });

  describe('eventFromMessage', () => {
    it('creates event from simple string message', async () => {
      const client = new EffectClient(getTestClientOptions());

      const event = await client.eventFromMessage('Hello world');

      expect(event.message).toBe('Hello world');
      expect(event.level).toBe('info');
    });

    it('creates event with custom severity level', async () => {
      const client = new EffectClient(getTestClientOptions());

      const event = await client.eventFromMessage('Warning message', 'warning');

      expect(event.level).toBe('warning');
    });

    it('creates event with error level', async () => {
      const client = new EffectClient(getTestClientOptions());

      const event = await client.eventFromMessage('Error message', 'error');

      expect(event.level).toBe('error');
    });

    it('creates event from parameterized string', async () => {
      const client = new EffectClient(getTestClientOptions());
      const parameterizedMessage = Object.assign('User john logged in', {
        __sentry_template_string__: 'User %s logged in',
        __sentry_template_values__: ['john'],
      });

      const event = await client.eventFromMessage(parameterizedMessage);

      expect(event.logentry?.message).toBe('User %s logged in');
      expect(event.logentry?.params).toEqual(['john']);
    });

    it('uses event_id from hint if provided', async () => {
      const client = new EffectClient(getTestClientOptions());

      const event = await client.eventFromMessage('Test', 'info', { event_id: 'msg-id-456' });

      expect(event.event_id).toBe('msg-id-456');
    });
  });
});
