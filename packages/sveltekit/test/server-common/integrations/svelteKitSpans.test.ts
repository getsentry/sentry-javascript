import type { SpanJSON, TransactionEvent } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { _enhanceKitSpan, svelteKitSpansIntegration } from '../../../src/server-common/integrations/svelteKitSpans';

describe('svelteKitSpansIntegration', () => {
  it('has a name and a preprocessEventHook', () => {
    const integration = svelteKitSpansIntegration();

    expect(integration.name).toBe('SvelteKitSpansEnhancement');
    expect(typeof integration.preprocessEvent).toBe('function');
  });

  it('enhances spans from SvelteKit', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      contexts: {
        trace: {
          span_id: '123',
          trace_id: 'abc',
          data: {
            'sveltekit.tracing.original_name': 'sveltekit.handle.root',
          },
        },
      },
      spans: [
        {
          description: 'sveltekit.resolve',
          data: {
            someAttribute: 'someValue',
          },
          span_id: '123',
          trace_id: 'abc',
          start_timestamp: 0,
        },
      ],
    };

    // @ts-expect-error -- passing in an empty option for client but it is unused in the integration
    svelteKitSpansIntegration().preprocessEvent?.(event, {}, {});

    expect(event.spans).toHaveLength(1);
    expect(event.spans?.[0]?.op).toBe('function.sveltekit.resolve');
    expect(event.spans?.[0]?.origin).toBe('auto.http.sveltekit');
    expect(event.spans?.[0]?.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('function.sveltekit.resolve');
    expect(event.spans?.[0]?.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.sveltekit');
  });

  describe('_enhanceKitSpan', () => {
    it.each([
      ['sveltekit.resolve', 'function.sveltekit.resolve', 'auto.http.sveltekit'],
      ['sveltekit.load', 'function.sveltekit.load', 'auto.function.sveltekit.load'],
      ['sveltekit.form_action', 'function.sveltekit.form_action', 'auto.function.sveltekit.action'],
      ['sveltekit.remote.call', 'function.sveltekit.remote', 'auto.rpc.sveltekit.remote'],
      ['sveltekit.handle.sequenced.0', 'function.sveltekit.handle', 'auto.function.sveltekit.handle'],
      ['sveltekit.handle.sequenced.myHandler', 'function.sveltekit.handle', 'auto.function.sveltekit.handle'],
    ])('enhances %s span with the correct op and origin', (spanName, op, origin) => {
      const span = {
        description: spanName,
        data: {
          someAttribute: 'someValue',
        },
        span_id: '123',
        trace_id: 'abc',
        start_timestamp: 0,
      } as SpanJSON;

      _enhanceKitSpan(span);

      expect(span.op).toBe(op);
      expect(span.origin).toBe(origin);
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe(op);
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe(origin);
    });

    it("doesn't change spans from other origins", () => {
      const span = {
        description: 'someOtherSpan',
        data: {},
      } as SpanJSON;

      _enhanceKitSpan(span);

      expect(span.op).toBeUndefined();
      expect(span.origin).toBeUndefined();
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBeUndefined();
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBeUndefined();
    });

    it("doesn't overwrite the sveltekit.handle.root span", () => {
      const rootHandleSpan = {
        description: 'sveltekit.handle.root',
        op: 'http.server',
        origin: 'auto.http.sveltekit',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.sveltekit',
        },
        span_id: '123',
        trace_id: 'abc',
        start_timestamp: 0,
      } as SpanJSON;

      _enhanceKitSpan(rootHandleSpan);

      expect(rootHandleSpan.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('http.server');
      expect(rootHandleSpan.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.sveltekit');
      expect(rootHandleSpan.op).toBe('http.server');
      expect(rootHandleSpan.origin).toBe('auto.http.sveltekit');
    });

    it("doesn't enhance unrelated spans", () => {
      const span = {
        description: 'someOtherSpan',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.pg',
        },
        op: 'db',
        origin: 'auto.db.pg',
        span_id: '123',
        trace_id: 'abc',
        start_timestamp: 0,
      } as SpanJSON;

      _enhanceKitSpan(span);

      expect(span.op).toBe('db');
      expect(span.origin).toBe('auto.db.pg');
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('db');
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.db.pg');
    });

    it("doesn't overwrite already set ops or origins on sveltekit spans", () => {
      // for example, if users manually set this (for whatever reason)
      const span = {
        description: 'sveltekit.resolve',
        origin: 'auto.custom.origin',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'custom.op',
        },
        span_id: '123',
        trace_id: 'abc',
        start_timestamp: 0,
      } as SpanJSON;

      _enhanceKitSpan(span);

      expect(span.origin).toBe('auto.custom.origin');
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('custom.op');
    });

    it('overwrites previously set "manual" origins on sveltekit spans', () => {
      // for example, if users manually set this (for whatever reason)
      const span = {
        description: 'sveltekit.resolve',
        origin: 'manual',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'custom.op',
        },
        span_id: '123',
        trace_id: 'abc',
        start_timestamp: 0,
      } as SpanJSON;

      _enhanceKitSpan(span);

      expect(span.origin).toBe('auto.http.sveltekit');
      expect(span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('custom.op');
    });
  });
});
