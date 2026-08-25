import { SENTRY_SEGMENT_NAME_SOURCE, HTTP_REQUEST_METHOD } from '@sentry/conventions/attributes';

import { describe, expect, it } from 'vitest';
import { enhanceRunHandlerRootSpan } from '../../src/edge/enhanceRunHandlerRootSpan';
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
  };
}

describe('enhanceRunHandlerRootSpan', () => {
  it('does nothing for spans that are not Node.runHandler', () => {
    const { span, getName, getOp } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute', [ATTR_NEXT_SPAN_NAME]: 'executing api route (pages) /api/foo' },
      'middleware GET',
    );

    enhanceRunHandlerRootSpan(span);

    expect(getName()).toBe('middleware GET');
    expect(getOp()).toBeUndefined();
    expect(span.attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBeUndefined();
  });

  it('does nothing when the span name is not a pages api route', () => {
    const { span, getName, getOp } = makeSpan(
      { [ATTR_NEXT_SPAN_TYPE]: 'Node.runHandler', [ATTR_NEXT_SPAN_NAME]: 'rendering page /foo' },
      'rendering page /foo',
    );

    enhanceRunHandlerRootSpan(span);

    expect(getName()).toBe('rendering page /foo');
    expect(getOp()).toBeUndefined();
  });

  it('sets op, source and a parameterized transaction name for pages api routes', () => {
    const { span, getName, getOp } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'Node.runHandler',
        [ATTR_NEXT_SPAN_NAME]: 'executing api route (pages) /api/edge-endpoint',
        [HTTP_REQUEST_METHOD]: 'POST',
      },
      'executing api route (pages) /api/edge-endpoint',
    );

    enhanceRunHandlerRootSpan(span);

    expect(getName()).toBe('POST /api/edge-endpoint');
    expect(getOp()).toBe('http.server');
    expect(span.attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
  });

  it('falls back to GET when no http method attribute is present', () => {
    const { span, getName } = makeSpan(
      {
        [ATTR_NEXT_SPAN_TYPE]: 'Node.runHandler',
        [ATTR_NEXT_SPAN_NAME]: 'executing api route (pages) /api/edge-endpoint',
      },
      'executing api route (pages) /api/edge-endpoint',
    );

    enhanceRunHandlerRootSpan(span);

    expect(getName()).toBe('GET /api/edge-endpoint');
  });
});
