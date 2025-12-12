import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { Client } from '../../../src';
import {
  getCurrentScope,
  getGlobalScope,
  Scope,
  SentrySpan,
  setCapturedScopesOnSpan,
  setCurrentClient,
  withStreamSpan,
} from '../../../src';
import { captureSpan } from '../../../src/spans/captureSpan';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('captureSpan', () => {
  let client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      environment: 'staging',
      release: '1.1.1',
    }),
  );

  const currentScope = new Scope();
  const isolationScope = new Scope();

  const enqueueSpanCallback = vi.fn();

  beforeEach(() => {
    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        environment: 'staging',
        release: '1.1.1',
      }),
    );
    client.on('enqueueSpan', enqueueSpanCallback);
    client.init();
    setCurrentClient(client as Client);
    currentScope.clear();
    isolationScope.clear();
    getGlobalScope().clear();
    currentScope.setClient(client as Client);
    isolationScope.setClient(client as Client);
    vi.clearAllMocks();
  });

  it("doesn't enqueue a span if no client is set", () => {
    getCurrentScope().setClient(undefined);
    const span = new SentrySpan({ name: 'spanName' });

    captureSpan(span);

    expect(enqueueSpanCallback).not.toHaveBeenCalled();
  });

  it('applies attributes from client and scopess to all spans', () => {
    client.getOptions()._metadata = {
      sdk: {
        name: 'sentry.javascript.browser',
        version: '1.0.0',
      },
    };
    const span = new SentrySpan({ name: 'spanName' });

    span.setAttribute('span_attr', 0);

    const segmentSpan = new SentrySpan({ name: 'segmentSpanName' });

    span.addLink({ context: segmentSpan.spanContext(), attributes: { 'sentry.link.type': 'my_link' } });

    // @ts-expect-error - this field part of the public contract
    span._sentryRootSpan = segmentSpan;

    currentScope.setAttribute('current_scope_attr', 1);
    isolationScope.setAttribute('isolation_scope_attr', { value: 2, unit: 'day' });
    getGlobalScope().setAttribute('global_scope_attr', { value: 3 });

    // this should NOT be applied to `span` because it's not a segment span
    currentScope.setContext('os', { name: 'os1' });

    setCapturedScopesOnSpan(span, currentScope, isolationScope);

    captureSpan(span, client);

    expect(enqueueSpanCallback).toHaveBeenCalledOnce();
    expect(enqueueSpanCallback).toHaveBeenCalledWith({
      _segmentSpan: segmentSpan, // <-- we need this reference to the segment span later on
      attributes: {
        'sentry.environment': {
          type: 'string',
          value: 'staging',
        },
        'sentry.origin': {
          type: 'string',
          value: 'manual',
        },
        'sentry.release': {
          type: 'string',
          value: '1.1.1',
        },
        'sentry.segment.id': {
          type: 'string',
          value: segmentSpan.spanContext().spanId,
        },
        'sentry.segment.name': {
          type: 'string',
          value: 'segmentSpanName',
        },
        span_attr: {
          type: 'integer',
          value: 0,
        },
        current_scope_attr: {
          type: 'integer',
          value: 1,
        },
        isolation_scope_attr: {
          type: 'integer',
          value: 2,
          unit: 'day',
        },
        global_scope_attr: {
          type: 'integer',
          value: 3,
        },
        'sentry.sdk.name': {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        'sentry.sdk.version': {
          type: 'string',
          value: '1.0.0',
        },
      },
      end_timestamp: expect.any(Number),
      start_timestamp: expect.any(Number),
      is_segment: false,
      links: [
        {
          attributes: {
            'sentry.link.type': {
              type: 'string',
              value: 'my_link',
            },
          },
          sampled: false,
          span_id: segmentSpan.spanContext().spanId,
          trace_id: segmentSpan.spanContext().traceId,
        },
      ],
      name: 'spanName',
      parent_span_id: undefined,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      status: 'ok',
    });
  });

  it('applies scope data to a segment span', () => {
    const span = new SentrySpan({ name: 'spanName' }); // if I don't set a segment explicitly, it will be a segment span

    getGlobalScope().setContext('os', { name: 'os3' });
    isolationScope.setContext('app', { name: 'myApp' });
    currentScope.setContext('os', { name: 'os1' });

    setCapturedScopesOnSpan(span, currentScope, isolationScope);

    captureSpan(span, client);

    expect(enqueueSpanCallback).toHaveBeenCalledOnce();
    expect(enqueueSpanCallback).toHaveBeenCalledWith({
      _segmentSpan: span,
      is_segment: true,
      attributes: {
        'sentry.release': {
          type: 'string',
          value: '1.1.1',
        },
        'sentry.segment.id': {
          type: 'string',
          value: span.spanContext().spanId,
        },
        'sentry.segment.name': {
          type: 'string',
          value: 'spanName',
        },
        'sentry.environment': {
          type: 'string',
          value: 'staging',
        },
        'sentry.origin': {
          type: 'string',
          value: 'manual',
        },
        'app.name': {
          type: 'string',
          value: 'myApp',
        },
        'os.name': {
          type: 'string',
          value: 'os1',
        },
      },
      end_timestamp: expect.any(Number),
      start_timestamp: expect.any(Number),
      name: 'spanName',
      parent_span_id: undefined,
      span_id: span.spanContext().spanId,
      trace_id: span.spanContext().traceId,
      links: undefined,
      status: 'ok',
    });
  });

  it('applies the beforeSendSpan callback to the span', () => {
    client.getOptions().beforeSendSpan = withStreamSpan(span => {
      return {
        ...span,
        attributes: {
          ...span.attributes,
          attribute_from_beforeSendSpan: {
            type: 'string',
            value: 'value_from_beforeSendSpan',
          },
        },
      };
    });
    const span = new SentrySpan({ name: 'spanName' });

    span.setAttribute('span_attr', 0);

    const segmentSpan = new SentrySpan({ name: 'segmentSpanName' });

    // @ts-expect-error - this field part of the public contract
    span._sentryRootSpan = segmentSpan;

    currentScope.setAttribute('current_scope_attr', 1);
    isolationScope.setAttribute('isolation_scope_attr', { value: 2, unit: 'day' });
    getGlobalScope().setAttribute('global_scope_attr', { value: 3 });

    setCapturedScopesOnSpan(span, currentScope, isolationScope);

    captureSpan(span, client);

    expect(enqueueSpanCallback).toHaveBeenCalledOnce();
    expect(enqueueSpanCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          attribute_from_beforeSendSpan: {
            type: 'string',
            value: 'value_from_beforeSendSpan',
          },
        }),
      }),
    );
  });

  it('applies user data iff sendDefaultPii is true and userdata is set', () => {
    client.getOptions().sendDefaultPii = true;
    currentScope.setUser({ id: '123', email: 'user@example.com', username: 'testuser' });

    const span = new SentrySpan({ name: 'spanName' });
    setCapturedScopesOnSpan(span, currentScope, isolationScope);

    captureSpan(span, client);

    expect(enqueueSpanCallback).toHaveBeenCalledOnce();
    expect(enqueueSpanCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'user.id': expect.objectContaining({
            type: 'string',
            value: '123',
          }),
          'user.email': expect.objectContaining({
            type: 'string',
            value: 'user@example.com',
          }),
          'user.name': expect.objectContaining({
            type: 'string',
            value: 'testuser',
          }),
        }),
      }),
    );
  });

  it("doesn't apply user data if sendDefaultPii is not set and userdata is available", () => {
    currentScope.setUser({ id: '123', email: 'user@example.com', username: 'testuser' });

    const span = new SentrySpan({ name: 'spanName' });
    setCapturedScopesOnSpan(span, currentScope, isolationScope);

    captureSpan(span, client);

    expect(enqueueSpanCallback).toHaveBeenCalledOnce();
    expect(enqueueSpanCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          'sentry.environment': {
            type: 'string',
            value: 'staging',
          },
          'sentry.origin': {
            type: 'string',
            value: 'manual',
          },
          'sentry.release': {
            type: 'string',
            value: '1.1.1',
          },
          'sentry.segment.id': {
            type: 'string',
            value: span.spanContext().spanId,
          },
          'sentry.segment.name': {
            type: 'string',
            value: 'spanName',
          },
        },
      }),
    );
  });

  test('scope attributes have precedence over attributes derived from contexts', () => {
    currentScope.setUser({ id: '123', email: 'user@example.com', username: 'testuser' });

    const span = new SentrySpan({ name: 'spanName' });
    setCapturedScopesOnSpan(span, currentScope, isolationScope);

    // Aalthough the current scope has precedence over the global scope,
    // scope attributes have precedence over context attributes
    getGlobalScope().setAttribute('app.name', 'myApp-scope-attribute');
    currentScope.setContext('app', { name: 'myApp-current-scope-context' });

    captureSpan(span, client);

    expect(enqueueSpanCallback).toHaveBeenCalledOnce();
    expect(enqueueSpanCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          'sentry.environment': {
            type: 'string',
            value: 'staging',
          },
          'sentry.origin': {
            type: 'string',
            value: 'manual',
          },
          'sentry.release': {
            type: 'string',
            value: '1.1.1',
          },
          'sentry.segment.id': {
            type: 'string',
            value: span.spanContext().spanId,
          },
          'sentry.segment.name': {
            type: 'string',
            value: 'spanName',
          },
          // Therefore, we expect the attribute to be taken from the global scope's attributes
          'app.name': {
            type: 'string',
            value: 'myApp-scope-attribute',
          },
        },
      }),
    );
  });
});
