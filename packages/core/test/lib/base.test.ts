import { Scope } from '@sentry/hub';
import { SentryEvent, Status } from '@sentry/types';
import { SentryError } from '../../src/error';
import { TestBackend } from '../mocks/backend';
import { TestClient } from '../mocks/client';
import { TestIntegration } from '../mocks/integration';

const PUBLIC_DSN = 'https://username@domain/path';

jest.mock('@sentry/utils/misc', () => ({
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
}));

jest.mock('@sentry/utils/string', () => ({
  truncate(str: string): string {
    return str;
  },
}));

describe('BaseClient', () => {
  describe('constructor() / getDsn()', () => {
    test('returns the Dsn', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      expect(client.getDsn()!.toString()).toBe(PUBLIC_DSN);
    });

    test('allows missing Dsn', () => {
      const client = new TestClient({});
      expect(client.getDsn()).toBeUndefined();
    });

    test('throws with invalid Dsn', () => {
      expect(() => new TestClient({ dsn: 'abc' })).toThrow(SentryError);
    });
  });

  describe('install()', () => {
    test('calls install() on Backend', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      client.install();
      expect(TestBackend.instance!.installed).toBe(1);
    });

    test('calls install() only once', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      client.install();
      client.install();
      expect(TestBackend.instance!.installed).toBe(1);
    });

    test('resolves the result of install()', async () => {
      const client = new TestClient({ mockInstallFailure: true });
      const installed = client.install();
      expect(installed).toBeFalsy();
    });

    test('does not install() when disabled', async () => {
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      client.install();
      expect(TestBackend.instance!.installed).toBe(0);
    });

    test('does not install() without Dsn', async () => {
      const client = new TestClient({});
      client.install();
      expect(TestBackend.instance!.installed).toBe(0);
    });
  });

  describe('getOptions()', () => {
    test('returns the options', () => {
      const options = { dsn: PUBLIC_DSN, test: true };
      const client = new TestClient(options);
      expect(client.getOptions()).toEqual(options);
    });
  });

  describe('getBreadcrumbs() / addBreadcrumb()', () => {
    test('adds a breadcrumb', () => {
      const client = new TestClient({});
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'hello' }, 100);
      client.addBreadcrumb({ message: 'world' }, undefined, scope);
      expect(scope.getBreadcrumbs()[1].message).toBe('world');
    });

    test('adds a timestamp to new breadcrumbs', () => {
      const client = new TestClient({});
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'hello' }, 100);
      client.addBreadcrumb({ message: 'world' }, undefined, scope);
      expect(scope.getBreadcrumbs()[1].timestamp).toBeGreaterThan(1);
    });

    test('discards breadcrumbs beyond maxBreadcrumbs', () => {
      const client = new TestClient({ maxBreadcrumbs: 1 });
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'hello' }, 100);
      client.addBreadcrumb({ message: 'world' }, undefined, scope);
      expect(scope.getBreadcrumbs().length).toBe(1);
      expect(scope.getBreadcrumbs()[0].message).toBe('world');
    });

    test('allows concurrent updates', () => {
      const client = new TestClient({});
      const scope = new Scope();
      client.addBreadcrumb({ message: 'hello' }, undefined, scope);
      client.addBreadcrumb({ message: 'world' }, undefined, scope);
      expect(scope.getBreadcrumbs()).toHaveLength(2);
    });

    test('calls beforeBreadcrumb and adds the breadcrumb without any changes', () => {
      const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      client.addBreadcrumb({ message: 'hello' }, undefined, scope);
      expect(scope.getBreadcrumbs()[0].message).toBe('hello');
    });

    test('calls beforeBreadcrumb and uses the new one', () => {
      const beforeBreadcrumb = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      client.addBreadcrumb({ message: 'hello' }, undefined, scope);
      expect(scope.getBreadcrumbs()[0].message).toBe('changed');
    });

    test('calls beforeBreadcrumb and discards the breadcrumb when returned null', () => {
      const beforeBreadcrumb = jest.fn(() => null);
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      client.addBreadcrumb({ message: 'hello' }, undefined, scope);
      expect(scope.getBreadcrumbs().length).toBe(0);
    });

    test('calls beforeBreadcrumb gets an access to a hint as a second argument', () => {
      const beforeBreadcrumb = jest.fn((breadcrumb, hint) => ({ ...breadcrumb, data: hint.data }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      client.addBreadcrumb({ message: 'hello' }, { data: 'someRandomThing' }, scope);
      expect(scope.getBreadcrumbs()[0].message).toBe('hello');
      expect(scope.getBreadcrumbs()[0].data).toBe('someRandomThing');
    });
  });

  describe('captures', () => {
    test('captures and sends exceptions', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureException(new Error('test exception'), undefined, scope);
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'random error',
            },
          ],
        },
        message: 'Error: test exception',
      });
    });

    test('captures and sends messages', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureMessage('test message', undefined, undefined, scope);
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'test message',
      });
    });
  });

  describe('captureEvent() / prepareEvent()', () => {
    test('skips when disabled', async () => {
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureEvent({}, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('skips without a Dsn', async () => {
      const client = new TestClient({});
      const scope = new Scope();
      await client.captureEvent({}, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('sends an event', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('message');
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'message',
      });
    });

    test('adds the configured environment', async () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        environment: 'env',
      });
      const scope = new Scope();
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'env',
        event_id: '42',
        message: 'message',
      });
    });

    test('adds the configured release', async () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        release: 'v1.0.0',
      });
      const scope = new Scope();
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        message: 'message',
        release: 'v1.0.0',
      });
    });

    test('adds breadcrumbs', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'breadcrumb' }, 100);
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [{ message: 'breadcrumb' }],
        event_id: '42',
        message: 'message',
      });
    });

    test('limits previously saved breadcrumbs', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      const scope = new Scope();
      scope.addBreadcrumb({ message: '1' }, 100);
      scope.addBreadcrumb({ message: '2' }, 200);
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [{ message: '2' }],
        event_id: '42',
        message: 'message',
      });
    });

    test('adds context data', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('b', 'b');
      scope.setTag('a', 'a');
      scope.setUser({ id: 'user' });
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        extra: { b: 'b' },
        message: 'message',
        tags: { a: 'a' },
        user: { id: 'user' },
      });
    });

    test('adds fingerprint', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      await client.captureEvent({ message: 'message' }, undefined, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        fingerprint: ['abcd'],
        message: 'message',
      });
    });

    test('calls beforeSend and uses original event without any changes', async () => {
      const beforeSend = jest.fn(event => event);
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('hello');
    });

    test('calls beforeSend and uses the new one', async () => {
      const beforeSend = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('changed');
    });

    test('calls beforeSend and discards the event', async () => {
      const beforeSend = jest.fn(() => null);
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls async beforeSend and uses original event without any changes', async () => {
      const beforeSend = jest.fn(
        async event =>
          new Promise<SentryEvent>(resolve => {
            resolve(event);
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('hello');
    });

    test('calls async beforeSend and uses the new one', async () => {
      const beforeSend = jest.fn(
        async () =>
          new Promise<SentryEvent>(resolve => {
            resolve({ message: 'changed' });
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, undefined, scope);
      expect(TestBackend.instance!.event!.message).toBe('changed');
    });

    test('calls async beforeSend and discards the event', async () => {
      const beforeSend = jest.fn(
        async () =>
          new Promise<null>(resolve => {
            resolve(null);
          }),
      );
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, undefined, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls beforeSend gets an access to a hint as a second argument', async () => {
      const beforeSend = jest.fn((event, hint) => ({ ...event, data: hint.data }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, { data: 'someRandomThing' }, scope);
      expect(TestBackend.instance!.event!.message).toBe('hello');
      expect(TestBackend.instance!.event!.data).toBe('someRandomThing');
    });

    test("doesn't do anything with rate limits yet", async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      TestBackend.instance!.sendEvent = async () => ({ status: Status.RateLimit });
      const scope = new Scope();
      await client.captureEvent({}, undefined, scope);
      // TODO: Test rate limiting queues here
    });
  });

  describe('integrations', () => {
    test('setup each one of them on ctor', () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        integrations: [new TestIntegration()],
      });
      expect(Object.keys(client.getIntegrations()).length).toBe(1);
      expect(client.getIntegration(TestIntegration)).toBeTruthy();
    });
  });
});
