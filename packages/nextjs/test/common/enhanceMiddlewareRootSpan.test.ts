import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { describe, expect, it } from 'vitest';
import { enhanceMiddlewareRootSpan } from '../../src/common/enhanceMiddlewareRootSpan';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';

function makeSpan(attributes: Record<string, unknown>, name?: string) {
  let currentName = name;
  let currentOp: string | undefined;
  return {
    span: {
      attributes,
      getName: () => currentName,
      setName: (n: string) => {
        currentName = n;
      },
      setOp: (op: string) => {
        currentOp = op;
      },
    },
    getName: () => currentName,
    getOp: () => currentOp,
    getSource: () => attributes[SENTRY_SEGMENT_NAME_SOURCE],
  };
}

describe('enhanceMiddlewareRootSpan', () => {
  it('does nothing for spans that are not Middleware.execute', () => {
    const { span, getName, getOp, getSource } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest', [ATTR_NEXT_SPAN_NAME]: 'middleware GET /foo' },
      'GET /foo',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('GET /foo');
    expect(getOp()).toBeUndefined();
    expect(getSource()).toBeUndefined();
  });

  it('sets the op but keeps the name and source when next.span_name is missing', () => {
    const { span, getName, getOp, getSource } = makeSpan({ [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute' }, 'middleware');

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware');
    expect(getOp()).toBe('middleware');
    expect(getSource()).toBeUndefined();
  });

  it('sets the op but keeps the name when next.span_name is an empty string', () => {
    const { span, getName, getOp } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: '' },
      'middleware',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware');
    expect(getOp()).toBe('middleware');
  });

  it('sets the op but keeps the name when next.span_name is not a string', () => {
    const { span, getName, getOp } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 123 },
      'middleware',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware');
    expect(getOp()).toBe('middleware');
  });

  it('sets the op but keeps the name when the current name is empty', () => {
    const { span, getName, getOp } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 'middleware GET /foo' },
      undefined,
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBeUndefined();
    expect(getOp()).toBe('middleware');
  });

  it.each([
    ['middleware GET /foo', 'middleware GET'],
    ['middleware POST /api/protected?token=abc', 'middleware POST'],
    ['middleware DELETE /resources/[id]', 'middleware DELETE'],
    ['middleware HEAD /', 'middleware HEAD'],
  ])('collapses "%s" to "%s" and sets a route source', (spanName, expected) => {
    const { span, getName, getOp, getSource } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: spanName },
      spanName,
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe(expected);
    expect(getOp()).toBe('middleware');
    expect(getSource()).toBe('route');
  });

  it('overrides a url source with route when collapsing an edge middleware name', () => {
    const { span, getName, getSource } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute',
        [ATTR_NEXT_SPAN_NAME]: 'middleware GET /foo',
        [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
      },
      'middleware GET /foo',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware GET');
    expect(getSource()).toBe('route');
  });

  it('normalizes the plain "middleware {METHOD}" name emitted for Node.js middleware', () => {
    // Node.js middleware roots come pre-mangled by HTTP span inference (e.g. `GET middleware GET`),
    // while `next.span_name` holds the original `middleware GET`.
    const { span, getName, getOp } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 'middleware GET' },
      'GET middleware GET',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware GET');
    expect(getOp()).toBe('middleware');
  });

  it('strips query and fragment from non-method-prefixed middleware names', () => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: '/api/foo?token=abc#section' },
      '/api/foo?token=abc#section',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('/api/foo');
  });

  it('does not collapse names that do not match the middleware-method prefix', () => {
    // CONNECT and TRACE are not in the regex - they fall through to query/fragment stripping
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 'middleware CONNECT /foo?bar=1' },
      'middleware CONNECT /foo?bar=1',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware CONNECT /foo');
  });
});
