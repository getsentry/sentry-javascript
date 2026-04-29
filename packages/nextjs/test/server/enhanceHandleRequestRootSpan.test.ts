import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import { TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL } from '../../src/common/span-attributes-with-logic-attached';
import { enhanceHandleRequestRootSpan } from '../../src/server/enhanceHandleRequestRootSpan';

function makeSpan(attributes: Record<string, unknown>, name?: string) {
  let currentName = name;
  let op: string | undefined;
  return {
    span: {
      attributes,
      getName: () => currentName,
      setName: (n: string) => {
        currentName = n;
      },
      setOp: (o: string) => {
        op = o;
      },
    },
    getName: () => currentName,
    getOp: () => op,
  };
}

describe('enhanceHandleRequestRootSpan', () => {
  it('does nothing for non-BaseServer.handleRequest spans', () => {
    const { span, getName, getOp } = makeSpan({ [ATTR_NEXT_SPAN_TYPE]: 'Render.getServerSideProps' }, 'GET /api/foo');
    enhanceHandleRequestRootSpan(span);
    expect(getName()).toBe('GET /api/foo');
    expect(getOp()).toBeUndefined();
    expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBeUndefined();
  });

  it('sets http.server op and source=route for parameterized routes', () => {
    const { span, getName, getOp } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'GET',
        'next.route': '/api/users/[id]',
      },
      'GET /api/users/123',
    );
    enhanceHandleRequestRootSpan(span);

    expect(getOp()).toBe('http.server');
    expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('http.server');
    expect(getName()).toBe('GET /api/users/[id]');
    expect(span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('route');
    expect(span.attributes[ATTR_NEXT_ROUTE]).toBe('/api/users/[id]');
  });

  it('strips trailing /route from app router route handler routes', () => {
    const { span, getName } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'POST',
        'next.route': '/api/widgets/route',
      },
      'POST /api/widgets/route',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('POST /api/widgets');
    expect(span.attributes[ATTR_NEXT_ROUTE]).toBe('/api/widgets');
  });

  it('strips URL query and fragment from the segment name', () => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest' },
      'GET /search?q=foo#section',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('GET /search');
  });

  it('does not rename middleware-prefixed routes via the route attribute', () => {
    const { span, getName } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'GET',
        'next.route': 'middleware GET',
      },
      'GET /foo',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('GET /foo');
  });

  it('uses the route backfill attribute when present', () => {
    const { span, getName } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'GET',
        [TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL]: '/posts/[slug]',
      },
      'GET /posts/hello-world',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('GET /posts/[slug]');
  });

  it('does not apply the backfill for the special GET /_app transaction', () => {
    const { span, getName } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'GET',
        [TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL]: '/posts/[slug]',
      },
      'GET /_app',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('GET /_app');
  });

  it('normalizes middleware span names and sets http.server.middleware op', () => {
    const { span, getName, getOp } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        [ATTR_NEXT_SPAN_NAME]: 'middleware POST /api/protected',
      },
      'middleware POST /api/protected?token=abc',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('middleware POST');
    expect(getOp()).toBe('http.server.middleware');
  });

  it('writes the middleware op into attributes when the adapter mirrors op writes (streamed shape)', () => {
    // Mirrors the `processSegmentSpan` adapter in src/server/index.ts where `setOp` writes back
    // into `attributes['sentry.op']` because that is the only op storage for streamed segment spans.
    const attributes: Record<string, unknown> = {
      [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
      [ATTR_NEXT_SPAN_NAME]: 'middleware GET /api',
    };
    let name: string | undefined = 'middleware GET /api';
    const span = {
      attributes,
      getName: () => name,
      setName: (n: string) => {
        name = n;
      },
      setOp: (op: string) => {
        attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
      },
    };

    enhanceHandleRequestRootSpan(span);

    expect(name).toBe('middleware GET');
    expect(attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('http.server.middleware');
  });

  it('rewrites GET /_error using the http.target attribute', () => {
    const { span, getName } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'GET',
        'http.target': '/api/broken',
      },
      'GET /_error',
    );

    enhanceHandleRequestRootSpan(span);

    expect(getName()).toBe('GET /api/broken');
  });
});
