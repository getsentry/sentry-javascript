import { Scope } from '@sentry/hub';
import { Breadcrumb, SentryEvent } from '@sentry/types';
import { SentryError } from '../../src/error';
import { TestBackend } from '../mocks/backend';
import { TEST_SDK, TestClient } from '../mocks/client';

const PUBLIC_DSN = 'https://username@domain/path';

jest.mock('@sentry/utils/misc', () => ({
  uuid4(): string {
    return '42';
  },
  getGlobalObject(): object {
    return {};
  },
}));

jest.mock('@sentry/utils/string', () => ({
  truncate(str: string): string {
    return str;
  },
}));

describe('BaseClient', () => {
  describe('constructor() / getDSN()', () => {
    test('returns the DSN', () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      expect(client.getDSN()!.toString()).toBe(PUBLIC_DSN);
    });

    test('allows missing DSN', () => {
      const client = new TestClient({});
      expect(client.getDSN()).toBeUndefined();
    });

    test('throws with invalid DSN', () => {
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

    test('does not install() without DSN', async () => {
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
    test('adds a breadcrumb', async () => {
      const client = new TestClient({});
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'hello' }, 100);
      await client.addBreadcrumb({ message: 'world' }, scope);
      expect(scope.getBreadcrumbs()[1].message).toBe('world');
    });

    test('adds a timestamp to new breadcrumbs', async () => {
      const client = new TestClient({});
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'hello' }, 100);
      await client.addBreadcrumb({ message: 'world' }, scope);
      expect(scope.getBreadcrumbs()[1].timestamp).toBeGreaterThan(1);
    });

    test('discards breadcrumbs beyond maxBreadcrumbs', async () => {
      const client = new TestClient({ maxBreadcrumbs: 1 });
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'hello' }, 100);
      await client.addBreadcrumb({ message: 'world' }, scope);
      expect(scope.getBreadcrumbs().length).toBe(1);
      expect(scope.getBreadcrumbs()[0].message).toBe('world');
    });

    test('exits early when breadcrumbs are deactivated', async () => {
      const shouldAddBreadcrumb = jest.fn();
      const client = new TestClient({
        maxBreadcrumbs: 0,
        shouldAddBreadcrumb,
      });
      const scope = new Scope();
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(shouldAddBreadcrumb.mock.calls).toHaveLength(0);
    });

    test('calls shouldAddBreadcrumb and adds the breadcrumb', async () => {
      const shouldAddBreadcrumb = jest.fn(() => true);
      const client = new TestClient({ shouldAddBreadcrumb });
      const scope = new Scope();
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(scope.getBreadcrumbs().length).toBe(1);
    });

    test('calls shouldAddBreadcrumb and discards the breadcrumb', async () => {
      const shouldAddBreadcrumb = jest.fn(() => false);
      const client = new TestClient({ shouldAddBreadcrumb });
      const scope = new Scope();
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(scope.getBreadcrumbs().length).toBe(0);
    });

    test('calls beforeBreadcrumb and uses the new one', async () => {
      const beforeBreadcrumb = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = new Scope();
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(scope.getBreadcrumbs()[0].message).toBe('changed');
    });

    test('calls afterBreadcrumb', async () => {
      const afterBreadcrumb = jest.fn();
      const client = new TestClient({ afterBreadcrumb });
      const scope = new Scope();
      await client.addBreadcrumb({ message: 'hello' }, scope);
      const breadcrumb = afterBreadcrumb.mock.calls[0][0] as Breadcrumb;
      expect(breadcrumb.message).toBe('hello');
    });

    test('allows concurrent updates', async () => {
      const client = new TestClient({});
      const scope = new Scope();
      await Promise.all([
        client.addBreadcrumb({ message: 'hello' }, scope),
        client.addBreadcrumb({ message: 'world' }, scope),
      ]);
      expect(scope.getBreadcrumbs()).toHaveLength(2);
    });
  });

  describe('captures', () => {
    test('captures and sends exceptions', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureException(new Error('test exception'), scope);
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
        sdk: TEST_SDK,
      });
    });

    test('captures and sends messages', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureMessage('test message', scope);
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'test message',
        sdk: TEST_SDK,
      });
    });
  });

  describe('captureEvent() / prepareEvent()', () => {
    test('skips when disabled', async () => {
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureEvent({}, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('skips without a DSN', async () => {
      const client = new TestClient({});
      const scope = new Scope();
      await client.captureEvent({}, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('sends an event', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!.message).toBe('message');
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('adds the configured environment', async () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        environment: 'env',
      });
      const scope = new Scope();
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'env',
        event_id: '42',
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('adds the configured release', async () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        release: 'v1.0.0',
      });
      const scope = new Scope();
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        message: 'message',
        release: 'v1.0.0',
        sdk: TEST_SDK,
      });
    });

    test('adds breadcrumbs', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'breadcrumb' }, 100);
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [{ message: 'breadcrumb' }],
        event_id: '42',
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('limits previously saved breadcrumbs', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      const scope = new Scope();
      scope.addBreadcrumb({ message: '1' }, 100);
      scope.addBreadcrumb({ message: '2' }, 200);
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [{ message: '2' }],
        event_id: '42',
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('adds context data', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setExtra('b', 'b');
      scope.setTag('a', 'a');
      scope.setUser({ id: 'user' });
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        extra: { b: 'b' },
        message: 'message',
        sdk: TEST_SDK,
        tags: { a: 'a' },
        user: { id: 'user' },
      });
    });

    test('adds fingerprint', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        event_id: '42',
        fingerprint: ['abcd'],
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('calls shouldSend and adds the event', async () => {
      const shouldSend = jest.fn(() => true);
      const client = new TestClient({ dsn: PUBLIC_DSN, shouldSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, scope);
      expect(TestBackend.instance!.event).toEqual({
        event_id: '42',
        message: 'hello',
        sdk: TEST_SDK,
      });
    });

    test('calls shouldSend and discards the event', async () => {
      const shouldSend = jest.fn(() => false);
      const client = new TestClient({ dsn: PUBLIC_DSN, shouldSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls beforeSend and uses the new one', async () => {
      const beforeSend = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, scope);
      expect(TestBackend.instance!.event!.message).toBe('changed');
    });

    test('calls afterSend', async () => {
      const afterSend = jest.fn();
      const client = new TestClient({ dsn: PUBLIC_DSN, afterSend });
      const scope = new Scope();
      await client.captureEvent({ message: 'hello' }, scope);
      const breadcrumb = afterSend.mock.calls[0][0] as SentryEvent;
      expect(breadcrumb.message).toBe('hello');
    });

    it("doesn't do anything with rate limits yet", async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      TestBackend.instance!.sendEvent = async () => 429;
      const scope = new Scope();
      await client.captureEvent({}, scope);
      // TODO: Test rate limiting queues here
    });
  });
});
