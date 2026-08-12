import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentrySpan,
  spanToStaticSpanJSON,
} from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { createLiveRootSpanAdapter } from '../../src/common/utils/liveRootSpanAdapter';

describe('createLiveRootSpanAdapter', () => {
  it('exposes the live span attributes, name and op', () => {
    const span = new SentrySpan({ name: 'original', attributes: { foo: 'bar' } });
    const adapter = createLiveRootSpanAdapter(span);

    expect(adapter.getName()).toBe('original');
    expect(adapter.attributes.foo).toBe('bar');

    adapter.setOp('http.server');
    expect(spanToStaticSpanJSON(span).data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('http.server');
  });

  it('renames the span without stamping source=custom (preserves an existing source)', () => {
    const span = new SentrySpan({
      name: 'original',
      attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' },
    });
    const adapter = createLiveRootSpanAdapter(span);

    adapter.setName('GET /users/[id]');

    const json = spanToStaticSpanJSON(span);
    expect(json.description).toBe('GET /users/[id]');
    // `span.updateName` would normally set source to `custom`; the adapter must keep `route`.
    expect(json.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('route');
  });

  it('does not introduce a source when the span has none', () => {
    const span = new SentrySpan({ name: 'original' });
    const adapter = createLiveRootSpanAdapter(span);

    adapter.setName('GET /users');

    const json = spanToStaticSpanJSON(span);
    expect(json.description).toBe('GET /users');
    expect(json.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBeUndefined();
  });
});
