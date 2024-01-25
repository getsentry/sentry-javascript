import type { Attachment, Breadcrumb, Client, Event } from '@sentry/types';
import {
  Hub,
  addTracingExtensions,
  applyScopeDataToEvent,
  getActiveSpan,
  getCurrentScope,
  getIsolationScope,
  makeMain,
  spanToJSON,
  startInactiveSpan,
  startSpan,
  withIsolationScope,
} from '../../src';

import { withActiveSpan } from '../../src/exports';
import { Scope, getGlobalScope, setGlobalScope } from '../../src/scope';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';

describe('Scope', () => {
  beforeEach(() => {
    setGlobalScope(undefined);
  });

  it('allows to create & update a scope', () => {
    const scope = new Scope();

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {},
      extra: {},
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  it('allows to clone a scope', () => {
    const scope = new Scope();

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    const newScope = scope.clone();
    expect(newScope).toBeInstanceOf(Scope);
    expect(newScope).not.toBe(scope);

    expect(newScope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  describe('global scope', () => {
    beforeEach(() => {
      setGlobalScope(undefined);
    });

    it('works', () => {
      const globalScope = getGlobalScope();
      expect(globalScope).toBeDefined();
      expect(globalScope).toBeInstanceOf(Scope);

      // Repeatedly returns the same instance
      expect(getGlobalScope()).toBe(globalScope);

      globalScope.setTag('tag1', 'val1');
      globalScope.setTag('tag2', 'val2');

      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
    });
  });

  describe('applyScopeDataToEvent', () => {
    it('works without any data', async () => {
      const scope = new Scope();

      const event = { message: 'foo' };
      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        sdkProcessingMetadata: {},
      });
    });

    it('works with data', async () => {
      const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
      const breadcrumb2 = { message: '1', timestamp: 111 } as Breadcrumb;

      const scope = new Scope();
      scope.update({
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
        propagationContext: { spanId: '1', traceId: '1' },
        fingerprint: ['aa'],
      });
      scope.addBreadcrumb(breadcrumb1);
      scope.setSDKProcessingMetadata({ aa: 'aa' });

      const event = { message: 'foo', breadcrumbs: [breadcrumb2], fingerprint: ['dd'] };

      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: {
          os: { name: 'os1' },
          culture: { display_name: 'name1' },
        },
        fingerprint: ['dd', 'aa'],
        breadcrumbs: [breadcrumb2, breadcrumb1],
        sdkProcessingMetadata: {
          aa: 'aa',
        },
      });
    });
  });

  describe('getAttachments', () => {
    /* eslint-disable deprecation/deprecation */
    it('works without any data', async () => {
      const scope = new Scope();

      const actual = scope.getAttachments();
      expect(actual).toEqual([]);
    });

    it('works with attachments', async () => {
      const attachment1 = { filename: '1' } as Attachment;
      const attachment2 = { filename: '2' } as Attachment;

      const scope = new Scope();
      scope.addAttachment(attachment1);
      scope.addAttachment(attachment2);

      const actual = scope.getAttachments();
      expect(actual).toEqual([attachment1, attachment2]);
    });
    /* eslint-enable deprecation/deprecation */
  });

  describe('setClient() and getClient()', () => {
    it('allows storing and retrieving client objects', () => {
      const fakeClient = {} as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);
      expect(scope.getClient()).toBe(fakeClient);
    });

    it('defaults to not having a client', () => {
      const scope = new Scope();
      expect(scope.getClient()).toBeUndefined();
    });
  });

  describe('.clone()', () => {
    it('will clone a client on the scope', () => {
      const fakeClient = {} as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const clonedScope = scope.clone();
      expect(clonedScope.getClient()).toBe(fakeClient);
    });
  });

  describe('.captureException()', () => {
    it('should call captureException() on client with newly generated event ID if not explicitly passed in', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const exception = new Error();

      scope.captureException(exception);

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: expect.any(String) }),
        scope,
      );
    });

    it('should return event ID when no client is on the scope', () => {
      const scope = new Scope();

      const exception = new Error();

      const eventId = scope.captureException(exception);

      expect(eventId).toEqual(expect.any(String));
    });

    it('should pass exception to captureException() on client', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const exception = new Error();

      scope.captureException(exception);

      expect(fakeCaptureException).toHaveBeenCalledWith(exception, expect.anything(), scope);
    });

    it('should call captureException() on client with a synthetic exception', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureException(new Error());

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ syntheticException: expect.any(Error) }),
        scope,
      );
    });

    it('should pass the original exception to captureException() on client', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const exception = new Error();
      scope.captureException(exception);

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ originalException: exception }),
        scope,
      );
    });

    it('should forward hint to captureException() on client', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureException(new Error(), { event_id: 'asdf', data: { foo: 'bar' } });

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: 'asdf', data: { foo: 'bar' } }),
        scope,
      );
    });
  });

  describe('.captureMessage()', () => {
    it('should call captureMessage() on client with newly generated event ID if not explicitly passed in', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('foo');

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ event_id: expect.any(String) }),
        scope,
      );
    });

    it('should return event ID when no client is on the scope', () => {
      const scope = new Scope();

      const eventId = scope.captureMessage('foo');

      expect(eventId).toEqual(expect.any(String));
    });

    it('should pass exception to captureMessage() on client', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('bar');

      expect(fakeCaptureMessage).toHaveBeenCalledWith('bar', undefined, expect.anything(), scope);
    });

    it('should call captureMessage() on client with a synthetic exception', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('foo');

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ syntheticException: expect.any(Error) }),
        scope,
      );
    });

    it('should pass the original exception to captureMessage() on client', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('baz');

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ originalException: 'baz' }),
        scope,
      );
    });

    it('should forward level and hint to captureMessage() on client', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('asdf', 'fatal', { event_id: 'asdf', data: { foo: 'bar' } });

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        'fatal',
        expect.objectContaining({ event_id: 'asdf', data: { foo: 'bar' } }),
        scope,
      );
    });
  });

  describe('.captureEvent()', () => {
    it('should call captureEvent() on client with newly generated event ID if not explicitly passed in', () => {
      const fakeCaptureEvent = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureEvent: fakeCaptureEvent,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureEvent({});

      expect(fakeCaptureEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: expect.any(String) }),
        scope,
      );
    });

    it('should return event ID when no client is on the scope', () => {
      const scope = new Scope();

      const eventId = scope.captureEvent({});

      expect(eventId).toEqual(expect.any(String));
    });

    it('should pass event to captureEvent() on client', () => {
      const fakeCaptureEvent = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureEvent: fakeCaptureEvent,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const event: Event = { event_id: 'asdf' };

      scope.captureEvent(event);

      expect(fakeCaptureEvent).toHaveBeenCalledWith(event, expect.anything(), scope);
    });

    it('should forward hint to captureEvent() on client', () => {
      const fakeCaptureEvent = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureEvent: fakeCaptureEvent,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureEvent({}, { event_id: 'asdf', data: { foo: 'bar' } });

      expect(fakeCaptureEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: 'asdf', data: { foo: 'bar' } }),
        scope,
      );
    });
  });
});

describe('isolation scope', () => {
  describe('withIsolationScope()', () => {
    it('will pass an isolation scope without Sentry.init()', done => {
      expect.assertions(1);
      withIsolationScope(scope => {
        expect(scope).toBeDefined();
        done();
      });
    });

    it('will make the passed isolation scope the active isolation scope within the callback', done => {
      expect.assertions(1);
      withIsolationScope(scope => {
        expect(getIsolationScope()).toBe(scope);
        done();
      });
    });

    it('will pass an isolation scope that is different from the current active scope', done => {
      expect.assertions(1);
      withIsolationScope(scope => {
        expect(getCurrentScope()).not.toBe(scope);
        done();
      });
    });

    it('will always make the inner most passed scope the current scope when nesting calls', done => {
      expect.assertions(1);
      withIsolationScope(_scope1 => {
        withIsolationScope(scope2 => {
          expect(getIsolationScope()).toBe(scope2);
          done();
        });
      });
    });
  });
});

describe('withActiveSpan()', () => {
  beforeAll(() => {
    addTracingExtensions();
  });

  beforeEach(() => {
    const options = getDefaultTestClientOptions({ enableTracing: true });
    const client = new TestClient(options);
    const scope = new Scope();
    const hub = new Hub(client, scope);
    makeMain(hub); // eslint-disable-line deprecation/deprecation
  });

  it('should set the active span within the callback', () => {
    expect.assertions(2);
    const inactiveSpan = startInactiveSpan({ name: 'inactive-span' });

    expect(getActiveSpan()).not.toBe(inactiveSpan);

    withActiveSpan(inactiveSpan!, () => {
      expect(getActiveSpan()).toBe(inactiveSpan);
    });
  });

  it('should create child spans when calling startSpan within the callback', done => {
    expect.assertions(2);
    const inactiveSpan = startInactiveSpan({ name: 'inactive-span' });

    withActiveSpan(inactiveSpan!, () => {
      startSpan({ name: 'child-span' }, childSpan => {
        // eslint-disable-next-line deprecation/deprecation
        expect(childSpan?.parentSpanId).toBe(inactiveSpan?.spanContext().spanId);
        expect(spanToJSON(childSpan!).parent_span_id).toBe(inactiveSpan?.spanContext().spanId);
        done();
      });
    });
  });
});
