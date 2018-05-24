import { Breadcrumb, SentryEvent } from '@sentry/shim';
import { SentryError } from '../../src/error';
import { ScopeContent } from '../../src/interfaces';
import { TestBackend, TestOptions } from '../mocks/backend';
import { TEST_SDK, TestClient } from '../mocks/client';

const PUBLIC_DSN = 'https://username@domain/path';

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

    test('initializes the internal scope', () => {
      const options = { dsn: PUBLIC_DSN };
      const scope = { breadcrumbs: [], context: { extra: { custom: true } } };

      class TempClient extends TestClient {
        public constructor(opts: TestOptions) {
          super(opts);
          expect(this.getInternalScope()).toBe(scope);
        }

        public getInitialScope(): ScopeContent {
          expect(this.getBackend()).toBe(TestBackend.instance);
          expect(this.getOptions()).toBe(options);
          expect(this.getDSN()!.toString()).toBe(PUBLIC_DSN);
          return scope;
        }
      }

      new TempClient(options);
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

  describe('getContext() / setContext()', () => {
    test('stores the context on the scope', async () => {
      const client = new TestClient({});
      const context = { extra: { updated: true } };
      const scope = { breadcrumbs: [], context: {} };
      await client.setContext(context, scope);
      expect(scope.context).toEqual(context);
    });

    test('merges extra into context', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [], context: { extra: { a: 'a' } } };
      await client.setContext({ extra: { b: 'b' } }, scope);
      expect(scope.context).toEqual({
        extra: { a: 'a', b: 'b' },
      });
    });

    test('merges tags into context', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [], context: { tags: { a: 'a' } } };
      await client.setContext({ tags: { b: 'b' } }, scope);
      expect(scope.context).toEqual({
        tags: { a: 'a', b: 'b' },
      });
    });

    test('merges user into context', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [], context: { user: { id: 'a' } } };
      await client.setContext({ user: { email: 'b' } }, scope);
      expect(scope.context).toEqual({
        user: { id: 'a', email: 'b' },
      });
    });

    test('allows concurrent updates', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [], context: {} };
      await Promise.all([
        client.setContext({ user: { email: 'a' } }, scope),
        client.setContext({ user: { id: 'b' } }, scope),
      ]);
      expect(scope.context).toEqual({
        user: {
          email: 'a',
          id: 'b',
        },
      });
    });
  });

  describe('getBreadcrumbs() / addBreadcrumb()', () => {
    test('adds a breadcrumb', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [{ message: 'hello' }], context: {} };
      await client.addBreadcrumb({ message: 'world' }, scope);
      expect(scope.breadcrumbs[1].message).toBe('world');
    });

    test('adds a timestamp to new breadcrumbs', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [{ message: 'hello' }], context: {} };
      await client.addBreadcrumb({ message: 'world' }, scope);
      expect((scope.breadcrumbs[1] as Breadcrumb).timestamp).toBeGreaterThan(1);
    });

    test('discards breadcrumbs beyond maxBreadcrumbs', async () => {
      const client = new TestClient({ maxBreadcrumbs: 1 });
      const scope = { breadcrumbs: [{ message: 'hello' }], context: {} };
      await client.addBreadcrumb({ message: 'world' }, scope);
      expect(scope.breadcrumbs.length).toBe(1);
      expect(scope.breadcrumbs[0].message).toBe('world');
    });

    test('exits early when breadcrumbs are deactivated', async () => {
      const shouldAddBreadcrumb = jest.fn();
      const client = new TestClient({
        maxBreadcrumbs: 0,
        shouldAddBreadcrumb,
      });
      const scope = { breadcrumbs: [], context: {} };
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(shouldAddBreadcrumb.mock.calls).toHaveLength(0);
    });

    test('calls shouldAddBreadcrumb and adds the breadcrumb', async () => {
      const shouldAddBreadcrumb = jest.fn(() => true);
      const client = new TestClient({ shouldAddBreadcrumb });
      const scope = { breadcrumbs: [], context: {} };
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(scope.breadcrumbs.length).toBe(1);
    });

    test('calls shouldAddBreadcrumb and discards the breadcrumb', async () => {
      const shouldAddBreadcrumb = jest.fn(() => false);
      const client = new TestClient({ shouldAddBreadcrumb });
      const scope = { breadcrumbs: [], context: {} };
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect(scope.breadcrumbs.length).toBe(0);
    });

    test('calls beforeBreadcrumb and uses the new one', async () => {
      const beforeBreadcrumb = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ beforeBreadcrumb });
      const scope = { breadcrumbs: [], context: {} };
      await client.addBreadcrumb({ message: 'hello' }, scope);
      expect((scope.breadcrumbs[0] as Breadcrumb).message).toBe('changed');
    });

    test('calls afterBreadcrumb', async () => {
      const afterBreadcrumb = jest.fn();
      const client = new TestClient({ afterBreadcrumb });
      const scope = { breadcrumbs: [], context: {} };
      await client.addBreadcrumb({ message: 'hello' }, scope);
      const breadcrumb = afterBreadcrumb.mock.calls[0][0] as Breadcrumb;
      expect(breadcrumb.message).toBe('hello');
    });

    test('allows concurrent updates', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [], context: {} };
      await Promise.all([
        client.addBreadcrumb({ message: 'hello' }, scope),
        client.addBreadcrumb({ message: 'world' }, scope),
      ]);
      expect(scope.breadcrumbs).toHaveLength(2);
    });
  });

  describe('captures', () => {
    test('captures and sends exceptions', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureException(new Error('test exception'), scope);
      expect(TestBackend.instance!.event).toEqual({
        exception: [
          {
            type: 'Error',
            value: 'random error',
          },
        ],
        message: 'Error: test exception',
        sdk: TEST_SDK,
      });
    });

    test('captures and sends messages', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureMessage('test message', scope);
      expect(TestBackend.instance!.event).toEqual({
        message: 'test message',
        sdk: TEST_SDK,
      });
    });
  });

  describe('captureEvent() / prepareEvent()', () => {
    test('skips when disabled', async () => {
      const client = new TestClient({ enabled: false, dsn: PUBLIC_DSN });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({}, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('skips without a DSN', async () => {
      const client = new TestClient({});
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({}, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('sends an event', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!.message).toBe('message');
      expect(TestBackend.instance!.event).toEqual({
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('adds the configured environment', async () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        environment: 'env',
      });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        environment: 'env',
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('adds the configured release', async () => {
      const client = new TestClient({
        dsn: PUBLIC_DSN,
        release: 'v1.0.0',
      });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        message: 'message',
        release: 'v1.0.0',
        sdk: TEST_SDK,
      });
    });

    test('adds breadcrumbs', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = { breadcrumbs: [{ message: 'breadcrumb' }], context: {} };
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [{ message: 'breadcrumb' }],
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('limits previously saved breadcrumbs', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      const scope = {
        breadcrumbs: [{ message: '1' }, { message: '2' }],
        context: {},
      };
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        breadcrumbs: [{ message: '2' }],
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    test('adds context data', async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      const scope = {
        breadcrumbs: [],
        context: {
          extra: { a: 'a' },
          tags: { b: 'b' },
          user: { id: 'user' },
        },
      };
      await client.captureEvent({ message: 'message' }, scope);
      expect(TestBackend.instance!.event!).toEqual({
        extra: { a: 'a' },
        message: 'message',
        sdk: TEST_SDK,
        tags: { b: 'b' },
        user: { id: 'user' },
      });
    });

    test('calls shouldSend and adds the event', async () => {
      const shouldSend = jest.fn(() => true);
      const client = new TestClient({ dsn: PUBLIC_DSN, shouldSend });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'hello' }, scope);
      expect(TestBackend.instance!.event).toEqual({
        message: 'hello',
        sdk: TEST_SDK,
      });
    });

    test('calls shouldSend and discards the event', async () => {
      const shouldSend = jest.fn(() => false);
      const client = new TestClient({ dsn: PUBLIC_DSN, shouldSend });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'hello' }, scope);
      expect(TestBackend.instance!.event).toBeUndefined();
    });

    test('calls beforeSend and uses the new one', async () => {
      const beforeSend = jest.fn(() => ({ message: 'changed' }));
      const client = new TestClient({ dsn: PUBLIC_DSN, beforeSend });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'hello' }, scope);
      expect(TestBackend.instance!.event!.message).toBe('changed');
    });

    test('calls afterSend', async () => {
      const afterSend = jest.fn();
      const client = new TestClient({ dsn: PUBLIC_DSN, afterSend });
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({ message: 'hello' }, scope);
      const breadcrumb = afterSend.mock.calls[0][0] as SentryEvent;
      expect(breadcrumb.message).toBe('hello');
    });

    it("doesn't do anything with rate limits yet", async () => {
      const client = new TestClient({ dsn: PUBLIC_DSN });
      TestBackend.instance!.sendEvent = async () => 429;
      const scope = { breadcrumbs: [], context: {} };
      await client.captureEvent({}, scope);
      // TODO: Test rate limiting queues here
    });
  });
});
