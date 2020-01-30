import { Hub, Scope } from '@sentry/hub';
import { Event } from '@sentry/types';
import { SentryError } from '@sentry/utils';

import { TestBackend } from '../mocks/backend';
import { TestClient } from '../mocks/client';
import { TestIntegration } from '../mocks/integration';
import { FakeTransport } from '../mocks/transport';

const PUBLIC_DSN = 'https://username@domain/path';

jest.mock('@sentry/utils', () => {
  const original = jest.requireActual('@sentry/utils');
  return {
    ...original,

    uuid4(): string {
      return '42';
    },
    getGlobalObject(): object {
      return {
        console: {
          log(): void {
            // no-empty
          },
          warn(): void {
            // no-empty
          },
          error(): void {
            // no-empty
          },
        },
      };
    },
    consoleSandbox(cb: () => any): any {
      return cb();
    },
    truncate(str: string): string {
      return str;
    },
  };
});

describe('BaseClient', () => {
  beforeEach(() => {
    TestBackend.sendEventCalled = undefined;
    TestBackend.instance = undefined;
  });

  describe('constructor() / getDsn()', () => {
    test('returns the Dsn', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      expect(client.getDsn()!.toString()).toBe(PUBLIC_DSN);
    });

    test('allows missing Dsn', () => {
      expect.assertions(1);
      const client = new TestClient({});
      expect(client.getDsn()).toBeUndefined();
    });

    test('throws with invalid Dsn', () => {
      expect.assertions(1);
      expect(() => new TestClient({ dsn: 'abc' })).toThrow(SentryError);
    });
  });

  describe('getOptions()', () => {
    test('returns the options', () => {
      expect.assertions(1);
      const options = { dsn: PUBLIC_DSN, test: true };
      const client = new TestClient(options);
      expect(client.getOptions()).toEqual(options);
    });
  });

  describe('getBreadcrumbs() / addBreadcrumb()', () => {
    test('adds a breadcrumb', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      const hub = new Hub(client, scope);
      scope.addBreadcrumb({ message: 'hello' }, 100);
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs[1].message).toBe('world');
    });

    test('adds a timestamp to new breadcrumbs', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      const hub = new Hub(client, scope);
      scope.addBreadcrumb({ message: 'hello' }, 100);
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs[1].timestamp).toBeGreaterThan(1);
    });

    test('discards breadcrumbs beyond maxBreadcrumbs', () => {
      expect.assertions(2);
      const client = new TestClient({ maxBreadcrumbs: 1 });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      scope.addBreadcrumb({ message: 'hello' }, 100);
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs.length).toBe(1);
      expect((scope as any)._breadcrumbs[0].message).toBe('world');
    });

    test('allows concurrent updates', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      hub.addBreadcrumb({ message: 'world' });
      expect((scope as any)._breadcrumbs).toHaveLength(2);
    });

    test('calls beforeBreadcrumb and adds the breadcrumb without any changes', () => {
      expect.assertions(1);
      const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      expect((scope as any)._breadcrumbs[0].message).toBe('hello');
    });

    test('calls beforeBreadcrumb and uses the new one', () => {
      expect.assertions(1);
      const beforeBreadcrumb = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      expect((scope as any)._breadcrumbs[0].message).toBe('changed');
    });

    test('calls beforeBreadcrumb and discards the breadcrumb when returned null', () => {
      expect.assertions(1);
      const beforeBreadcrumb = jest.fn(() => null);
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' });
      expect((scope as any)._breadcrumbs.length).toBe(0);
    });

    test('calls beforeBreadcrumb gets an access to a hint as a second argument', () => {
      expect.assertions(2);
      const beforeBreadcrumb = jest.fn((breadcrumb, hint) => ({ ...breadcrumb, data: hint.data }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: 'hello' }, { data: 'someRandomThing' });
      expect((scope as any)._breadcrumbs[0].message).toBe('hello');
      expect((scope as any)._breadcrumbs[0].data).toBe('someRandomThing');
    });
  });

  describe('captures', () => {
    test('captures and sends exceptions', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      client.captureException(new Error('test exception'));
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'test exception',
            },
          ],
        },
      });
    });

    test('captures and sends messages', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      client.captureMessage('test message');
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'test message',
      });
    });

    test('should call eventFromException if input to captureMessage is not a primitive', () => {
      expect.assertions(2);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const spy = jest.spyOn(TestBackend.instance!, 'eventFromException');

      client.captureMessage('foo');
      client.captureMessage(null as any);
      client.captureMessage(undefined as any);
      client.captureMessage(1 as any);
      client.captureMessage(false as any);
      expect(spy.mock.calls.length).toEqual(0);

      client.captureMessage({} as any);
      client.captureMessage([] as any);
      expect(spy.mock.calls.length).toEqual(2);
    });
  });

  describe('captureEvent() / prepareEvent()', () => {
    test('skips when disabled', () => {
      expect.assertions(1);
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({}, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('skips without a Dsn', () => {
      expect.assertions(1);
      const client = new TestClient({});
      const scope = new Scope();
      client.captureEvent({}, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('sends an event', () => {
      expect.assertions(2);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('message');
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'message',
      });
    });

    test('adds event_id from hint if available', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, { event_id: 'wat' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: 'wat',
        message: 'message',
      });
    });

    test('adds the configured environment', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        environment: 'env',
      });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'env',
        event_id: '42',
        message: 'message',
      });
    });

    test('adds the configured release', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        release: 'v1.0.0',
      });
      const scope = new Scope();
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        message: 'message',
        release: 'v1.0.0',
      });
    });

    test('adds breadcrumbs', () => {
      expect.assertions(4);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'breadcrumb' }, 100);
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toHaveProperty('event_id', '42');
      expect(TestBackend.instance!.event!).toHaveProperty('message', 'message');
      expect(TestBackend.instance!.event!).toHaveProperty('breadcrumbs');
      expect(TestBackend.instance!.event!.breadcrumbs![0]).toHaveProperty('message', 'breadcrumb');
    });

    test('limits previously saved breadcrumbs', () => {
      expect.assertions(2);
      const client = new TestClient({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      const scope = new Scope();
      const hub = new Hub(client, scope);
      hub.addBreadcrumb({ message: '1' });
      hub.addBreadcrumb({ message: '2' });
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!.breadcrumbs).toHaveLength(1);
      expect(TestBackend.instance!.event!.breadcrumbs![0].message).toEqual('2');
    });

    test('adds context data', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('b', 'b');
      scope.setTag('a', 'a');
      scope.setUser({ id: 'user' });
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        extra: { b: 'b' },
        message: 'message',
        tags: { a: 'a' },
        user: { id: 'user' },
      });
    });

    test('adds fingerprint', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        fingerprint: ['abcd'],
        message: 'message',
      });
    });

    test('normalizes event with default depth of 3', () => {
      expect.assertions(1);
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const fourLevelsObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const normalizedObject = {
        a: {
          b: {
            c: 'wat',
            d: '[Object]',
          },
        },
      };
      const fourLevelBreadcrumb = {
        data: fourLevelsObject,
        message: 'wat',
      };
      const normalizedBreadcrumb = {
        data: normalizedObject,
        message: 'wat',
      };
      client.captureEvent({
        breadcrumbs: [fourLevelBreadcrumb, fourLevelBreadcrumb, fourLevelBreadcrumb],
        contexts: fourLevelsObject,
        extra: fourLevelsObject,
        user: fourLevelsObject,
      });
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
        contexts: normalizedObject,
        event_id: '42',
        extra: normalizedObject,
        user: normalizedObject,
      });
    });

    test('normalization respects `normalizeDepth` option', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        normalizeDepth: 2,
      });
      const fourLevelsObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const normalizedObject = {
        a: {
          b: '[Object]',
        },
      };
      const fourLevelBreadcrumb = {
        data: fourLevelsObject,
        message: 'wat',
      };
      const normalizedBreadcrumb = {
        data: normalizedObject,
        message: 'wat',
      };
      client.captureEvent({
        breadcrumbs: [fourLevelBreadcrumb, fourLevelBreadcrumb, fourLevelBreadcrumb],
        contexts: fourLevelsObject,
        extra: fourLevelsObject,
        user: fourLevelsObject,
      });
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
        contexts: normalizedObject,
        event_id: '42',
        extra: normalizedObject,
        user: normalizedObject,
      });
    });

    test('skips normalization when `normalizeDepth: 0`', () => {
      expect.assertions(1);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        normalizeDepth: 0,
      });
      const fourLevelsObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const normalizedObject = {
        a: {
          b: {
            c: 'wat',
            d: {
              e: 'wat',
            },
          },
        },
      };
      const fourLevelBreadcrumb = {
        data: fourLevelsObject,
        message: 'wat',
      };
      const normalizedBreadcrumb = {
        data: normalizedObject,
        message: 'wat',
      };
      client.captureEvent({
        breadcrumbs: [fourLevelBreadcrumb, fourLevelBreadcrumb, fourLevelBreadcrumb],
        contexts: fourLevelsObject,
        extra: fourLevelsObject,
        user: fourLevelsObject,
      });
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [normalizedBreadcrumb, normalizedBreadcrumb, normalizedBreadcrumb],
        contexts: normalizedObject,
        event_id: '42',
        extra: normalizedObject,
        user: normalizedObject,
      });
    });

    test('calls beforeSend and uses original event without any changes', () => {
      expect.assertions(1);
      const beforeSend = jest.fn(event => event);
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event!.message).toBe('hello');
    });

    test('calls beforeSend and uses the new one', () => {
      expect.assertions(1);
      const beforeSend = jest.fn(() => ({ message: 'changed1' }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event!.message).toBe('changed1');
    });

    test('calls beforeSend and discards the event', () => {
      expect.assertions(1);
      const beforeSend = jest.fn(() => null);
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls async beforeSend and uses original event without any changes', done => {
      jest.useFakeTimers();
      expect.assertions(1);
      const beforeSend = jest.fn(
        async event =>
          new Promise<Event>(resolve => {
            setTimeout(() => {
              resolve(event);
            }, 1);
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      jest.runOnlyPendingTimers();
      TestBackend.sendEventCalled = (event: Event) => {
        expect(event.message).toBe('hello');
      };
      setTimeout(() => {
        done();
      }, 5);
      jest.runOnlyPendingTimers();
    });

    test('calls async beforeSend and uses the new one', done => {
      jest.useFakeTimers();
      expect.assertions(1);
      const beforeSend = jest.fn(
        async () =>
          new Promise<Event>(resolve => {
            setTimeout(() => {
              resolve({ message: 'changed2' });
            }, 1);
          }),
      );

      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      jest.runOnlyPendingTimers();
      TestBackend.sendEventCalled = (event: Event) => {
        expect(event.message).toBe('changed2');
      };
      setTimeout(() => {
        done();
      }, 5);
      jest.runOnlyPendingTimers();
    });

    test('calls async beforeSend and discards the event', () => {
      jest.useFakeTimers();
      expect.assertions(1);
      const beforeSend = jest.fn(
        async () =>
          new Promise<null>(resolve => {
            setTimeout(() => {
              resolve(null);
            });
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' });
      jest.runAllTimers();
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls beforeSend gets an access to a hint as a second argument', () => {
      expect.assertions(2);
      const beforeSend = jest.fn((event, hint) => ({ ...event, data: hint.data }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      client.captureEvent({ message: 'hello' }, { data: 'someRandomThing' });
      expect(TestBackend.instance!.event!.message).toBe('hello');
      expect((TestBackend.instance!.event! as any).data).toBe('someRandomThing');
    });
  });

  describe('integrations', () => {
    test('setup each one of them on ctor', () => {
      expect.assertions(2);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        integrations: [new TestIntegration()],
      });
      expect(Object.keys(client.getIntegrations()).length).toBe(1);
      expect(client.getIntegration(TestIntegration)).toBeTruthy();
    });

    test('skips installation if DSN is not provided', () => {
      expect.assertions(2);
      const client = new TestClient({
        integrations: [new TestIntegration()],
      });
      expect(Object.keys(client.getIntegrations()).length).toBe(0);
      expect(client.getIntegration(TestIntegration)).toBeFalsy();
    });

    test('skips installation if enabled is set to false', () => {
      expect.assertions(2);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enabled: false,
        integrations: [new TestIntegration()],
      });
      expect(Object.keys(client.getIntegrations()).length).toBe(0);
      expect(client.getIntegration(TestIntegration)).toBeFalsy();
    });
  });

  describe('flush/close', () => {
    test('flush', async () => {
      jest.useRealTimers();
      expect.assertions(5);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enableSend: true,
        transport: FakeTransport,
      });

      const delay = 1;
      const transportInstance = (client as any)._getBackend().getTransport() as FakeTransport;
      transportInstance.delay = delay;

      client.captureMessage('test');
      expect(transportInstance).toBeInstanceOf(FakeTransport);
      expect(transportInstance.sendCalled).toEqual(1);
      expect(transportInstance.sentCount).toEqual(0);
      await client.flush(delay);
      expect(transportInstance.sentCount).toEqual(1);
      expect(transportInstance.sendCalled).toEqual(1);
    });

    test('close', async () => {
      jest.useRealTimers();
      expect.assertions(2);
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        enableSend: true,
        transport: FakeTransport,
      });

      const delay = 1;
      const transportInstance = (client as any)._getBackend().getTransport() as FakeTransport;
      transportInstance.delay = delay;

      expect(client.captureMessage('test')).toBeTruthy();
      await client.close(delay);
      // Sends after close shouldn't work anymore
      expect(client.captureMessage('test')).toBeFalsy();
    });

    test('multiple concurrent flush calls should just work', async () => {
      jest.useRealTimers();
      expect.assertions(3);

      const client = new TestClient({ dsn: PUBLIC_DSN });

      return Promise.all([
        client.flush(1).then(() => expect(true).toEqual(true)),
        client.flush(1).then(() => expect(true).toEqual(true)),
        client.flush(1).then(() => expect(true).toEqual(true)),
      ]);
    });
  });
});
