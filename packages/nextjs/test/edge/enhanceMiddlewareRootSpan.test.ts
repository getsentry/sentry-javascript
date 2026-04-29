import { describe, expect, it } from 'vitest';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import { enhanceMiddlewareRootSpan } from '../../src/edge/enhanceMiddlewareRootSpan';

function makeSpan(attributes: Record<string, unknown>, name?: string) {
  let currentName = name;
  return {
    span: {
      attributes,
      getName: () => currentName,
      setName: (n: string) => {
        currentName = n;
      },
    },
    getName: () => currentName,
  };
}

describe('enhanceMiddlewareRootSpan', () => {
  it('does nothing for spans that are not Middleware.execute', () => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest', [ATTR_NEXT_SPAN_NAME]: 'middleware GET /foo' },
      'GET /foo',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('GET /foo');
  });

  it('does nothing when next.span_name is missing', () => {
    const { span, getName } = makeSpan({ [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute' }, 'middleware');

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware');
  });

  it('does nothing when next.span_name is an empty string', () => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: '' },
      'middleware',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware');
  });

  it('does nothing when next.span_name is not a string', () => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 123 },
      'middleware',
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe('middleware');
  });

  it('does nothing when the current name is empty', () => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 'middleware GET /foo' },
      undefined,
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBeUndefined();
  });

  it.each([
    ['middleware GET /foo', 'middleware GET'],
    ['middleware POST /api/protected?token=abc', 'middleware POST'],
    ['middleware DELETE /resources/[id]', 'middleware DELETE'],
    ['middleware HEAD /', 'middleware HEAD'],
  ])('collapses "%s" to "%s"', (spanName, expected) => {
    const { span, getName } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: spanName },
      spanName,
    );

    enhanceMiddlewareRootSpan(span);

    expect(getName()).toBe(expected);
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
