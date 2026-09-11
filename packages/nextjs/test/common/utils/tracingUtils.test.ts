import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import type { Client, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTR_NEXT_SEGMENT, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../../src/common/nextSpanAttributes';
import { maybeEnhanceServerComponentSpanName } from '../../../src/common/utils/tracingUtils';

function mockClient(traceLifecycle: 'stream' | 'static'): void {
  vi.spyOn(SentryCore, 'getClient').mockReturnValue({
    getOptions: () => ({ traceLifecycle }),
  } as unknown as Client);
}

function mockSpan() {
  const span = {
    name: undefined as string | undefined,
    attributes: {} as Record<string, unknown>,
    updateName(name: string) {
      span.name = name;
    },
    setAttributes(attributes: Record<string, unknown>) {
      Object.assign(span.attributes, attributes);
    },
    setAttribute(key: string, value: unknown) {
      span.attributes[key] = value;
    },
  };
  return span;
}

function resolveSegmentAttributes(segment: string) {
  return {
    [ATTR_NEXT_SPAN_TYPE]: 'NextNodeServer.getLayoutOrPageModule',
    [ATTR_NEXT_SPAN_NAME]: 'resolve segment modules',
    [ATTR_NEXT_SEGMENT]: segment,
  };
}

// `null` means the root span carries no `http.route` yet.
function enhance(segment: string, route: string | null = '/nested-layout/[dynamic]') {
  const span = mockSpan();
  maybeEnhanceServerComponentSpanName(
    span as unknown as Span,
    resolveSegmentAttributes(segment) as never,
    (route === null ? {} : { [HTTP_ROUTE]: route }) as never,
    SentryCore.getClient()!,
  );
  return span;
}

describe('maybeEnhanceServerComponentSpanName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing for spans that are not resolve segment spans', () => {
    mockClient('stream');
    const span = mockSpan();

    maybeEnhanceServerComponentSpanName(
      span as unknown as Span,
      { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest' } as never,
      {} as never,
      SentryCore.getClient()!,
    );

    expect(span.name).toBeUndefined();
    expect(span.attributes).toEqual({});
  });

  describe('with span streaming enabled', () => {
    it.each([
      ['__PAGE__', 'Page', 'resolve page server component "/nested-layout/[dynamic]"'],
      ['', 'Layout', 'resolve root layout server component'],
      ['[dynamic]', 'Layout', 'resolve layout server component "[dynamic]"'],
    ])('names the %s segment span %s', (segment, expectedName, expectedDescription) => {
      mockClient('stream');

      const span = enhance(segment);

      expect(span.name).toBe(expectedName);
      expect(span.attributes).toMatchObject({
        'sentry.description': expectedDescription,
        'code.function.name': expectedName,
        'sentry.op': 'function',
      });
    });
  });

  describe('with span streaming disabled', () => {
    it.each([
      ['__PAGE__', 'resolve page server component "/nested-layout/[dynamic]"'],
      ['', 'resolve root layout server component'],
      ['[dynamic]', 'resolve layout server component "[dynamic]"'],
    ])('keeps the descriptive name for the %s segment span', (segment, expectedName) => {
      mockClient('static');

      const span = enhance(segment);

      expect(span.name).toBe(expectedName);
      // The description is set in both lifecycles, so it always matches what the static name was.
      expect(span.attributes['sentry.description']).toBe(expectedName);
    });
  });

  it('keeps the route and the `Page`/`Layout` distinction on attributes', () => {
    mockClient('stream');

    expect(enhance('__PAGE__').attributes).toMatchObject({
      'sentry.nextjs.ssr.function.type': 'Page',
      'sentry.nextjs.ssr.function.route': '/nested-layout/[dynamic]',
      'http.route': '/nested-layout/[dynamic]',
    });
    expect(enhance('[dynamic]').attributes).toMatchObject({
      'sentry.nextjs.ssr.function.type': 'Layout',
      'http.route': '/nested-layout/[dynamic]',
    });
  });

  it('falls back to an empty route when the root span has none', () => {
    mockClient('static');
    const span = enhance('__PAGE__', null);

    expect(span.name).toBe('resolve page server component ""');
    expect(span.attributes['http.route']).toBeUndefined();
  });
});
