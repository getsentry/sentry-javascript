/* eslint-disable deprecation/deprecation */
import type { Span, TimeInput } from '@opentelemetry/api';
import { context, ROOT_CONTEXT, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SEMATTRS_HTTP_METHOD } from '@opentelemetry/semantic-conventions';
import type { Event, Scope } from '@sentry/core';
import {
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanIsSampled,
  spanToJSON,
  suppressTracing,
  withScope,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getParentSpanId } from '../../../packages/opentelemetry/src/utils/getParentSpanId';
import { continueTrace, startInactiveSpan, startSpan, startSpanManual } from '../src/trace';
import type { AbstractSpan } from '../src/types';
import { getActiveSpan } from '../src/utils/getActiveSpan';
import { getSamplingDecision } from '../src/utils/getSamplingDecision';
import { getSpanKind } from '../src/utils/getSpanKind';
import { makeTraceState } from '../src/utils/makeTraceState';
import { spanHasAttributes, spanHasName } from '../src/utils/spanTypes';
import { isSpan } from './helpers/isSpan';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

describe('trace', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  describe('startSpan', () => {
    it('works with a sync callback', () => {
      const spans: Span[] = [];

      expect(getActiveSpan()).toEqual(undefined);

      const res = startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans.push(outerSpan);

        expect(getSpanName(outerSpan)).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        startSpan({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans.push(innerSpan);

          expect(getSpanName(innerSpan)).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });

        return 'test value';
      });

      expect(res).toEqual('test value');

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans).toHaveLength(2);
      const [outerSpan, innerSpan] = spans as [Span, Span];

      expect(getSpanName(outerSpan)).toEqual('outer');
      expect(getSpanName(innerSpan)).toEqual('inner');

      expect(getSpanEndTime(outerSpan)).not.toEqual([0, 0]);
      expect(getSpanEndTime(innerSpan)).not.toEqual([0, 0]);
    });

    it('works with an async callback', async () => {
      const spans: Span[] = [];

      expect(getActiveSpan()).toEqual(undefined);

      const res = await startSpan({ name: 'outer' }, async outerSpan => {
        expect(outerSpan).toBeDefined();
        spans.push(outerSpan);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(getSpanName(outerSpan)).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        await startSpan({ name: 'inner' }, async innerSpan => {
          expect(innerSpan).toBeDefined();
          spans.push(innerSpan);

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(getSpanName(innerSpan)).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });

        return 'test value';
      });

      expect(res).toEqual('test value');

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans).toHaveLength(2);
      const [outerSpan, innerSpan] = spans as [Span, Span];

      expect(getSpanName(outerSpan)).toEqual('outer');
      expect(getSpanName(innerSpan)).toEqual('inner');

      expect(getSpanEndTime(outerSpan)).not.toEqual([0, 0]);
      expect(getSpanEndTime(innerSpan)).not.toEqual([0, 0]);
    });

    it('works with multiple parallel calls', () => {
      const spans1: Span[] = [];
      const spans2: Span[] = [];

      expect(getActiveSpan()).toEqual(undefined);

      startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans1.push(outerSpan);

        expect(getSpanName(outerSpan)).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        startSpan({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans1.push(innerSpan);

          expect(getSpanName(innerSpan)).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });
      });

      startSpan({ name: 'outer2' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans2.push(outerSpan);

        expect(getSpanName(outerSpan)).toEqual('outer2');
        expect(getActiveSpan()).toEqual(outerSpan);

        startSpan({ name: 'inner2' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans2.push(innerSpan);

          expect(getSpanName(innerSpan)).toEqual('inner2');
          expect(getActiveSpan()).toEqual(innerSpan);
        });
      });

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans1).toHaveLength(2);
      expect(spans2).toHaveLength(2);
    });

    it('works with multiple parallel async calls', async () => {
      const spans1: Span[] = [];
      const spans2: Span[] = [];

      expect(getActiveSpan()).toEqual(undefined);

      const promise1 = startSpan({ name: 'outer' }, async outerSpan => {
        expect(outerSpan).toBeDefined();
        spans1.push(outerSpan);

        expect(getSpanName(outerSpan)).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);
        expect(getRootSpan(outerSpan)).toEqual(outerSpan);

        await new Promise(resolve => setTimeout(resolve, 10));

        await startSpan({ name: 'inner' }, async innerSpan => {
          expect(innerSpan).toBeDefined();
          spans1.push(innerSpan);

          expect(getSpanName(innerSpan)).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
          expect(getRootSpan(innerSpan)).toEqual(outerSpan);
        });
      });

      const promise2 = startSpan({ name: 'outer2' }, async outerSpan => {
        expect(outerSpan).toBeDefined();
        spans2.push(outerSpan);

        expect(getSpanName(outerSpan)).toEqual('outer2');
        expect(getActiveSpan()).toEqual(outerSpan);
        expect(getRootSpan(outerSpan)).toEqual(outerSpan);

        await new Promise(resolve => setTimeout(resolve, 10));

        await startSpan({ name: 'inner2' }, async innerSpan => {
          expect(innerSpan).toBeDefined();
          spans2.push(innerSpan);

          expect(getSpanName(innerSpan)).toEqual('inner2');
          expect(getActiveSpan()).toEqual(innerSpan);
          expect(getRootSpan(innerSpan)).toEqual(outerSpan);
        });
      });

      await Promise.all([promise1, promise2]);

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans1).toHaveLength(2);
      expect(spans2).toHaveLength(2);
    });

    it('allows to pass context arguments', () => {
      startSpan(
        {
          name: 'outer',
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanAttributes(span)).toEqual({
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          });
        },
      );

      startSpan(
        {
          name: 'outer',
          op: 'my-op',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test.origin',
          },
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanAttributes(span)).toEqual({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test.origin',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'my-op',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          });
        },
      );
    });

    it('allows to pass base SpanOptions', () => {
      const date = [5000, 0] as TimeInput;

      startSpan(
        {
          name: 'outer',
          kind: SpanKind.CLIENT,
          attributes: {
            test1: 'test 1',
            test2: 2,
          },
          startTime: date,
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanName(span)).toEqual('outer');
          expect(getSpanStartTime(span)).toEqual(date);
          expect(getSpanAttributes(span)).toEqual({
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            test1: 'test 1',
            test2: 2,
          });
          expect(getSpanKind(span)).toEqual(SpanKind.CLIENT);
        },
      );
    });

    it('allows to pass a startTime in seconds', () => {
      const startTime = 1708504860.961;
      const start = startSpan({ name: 'outer', startTime: startTime }, span => {
        return getSpanStartTime(span);
      });

      expect(start).toEqual([1708504860, 961000000]);
    });

    it('allows to pass a scope', () => {
      const initialScope = getCurrentScope();

      let manualScope: Scope;
      let parentSpan: Span;

      // "hack" to create a manual scope with a parent span
      startSpanManual({ name: 'detached' }, span => {
        parentSpan = span;
        manualScope = getCurrentScope();
        manualScope.setTag('manual', 'tag');
      });

      expect(manualScope!.getScopeData().tags).toEqual({ manual: 'tag' });
      expect(getCurrentScope()).not.toBe(manualScope!);

      getCurrentScope().setTag('outer', 'tag');

      startSpan({ name: 'GET users/[id]', scope: manualScope! }, span => {
        // the current scope in the callback is a fork of the manual scope
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(manualScope);
        expect(getCurrentScope().getScopeData().tags).toEqual({ manual: 'tag' });

        // getActiveSpan returns the correct span
        expect(getActiveSpan()).toBe(span);

        // span hierarchy is correct
        expect(getSpanParentSpanId(span)).toBe(parentSpan.spanContext().spanId);

        // scope data modifications are isolated between original and forked manual scope
        getCurrentScope().setTag('inner', 'tag');
        manualScope!.setTag('manual-scope-inner', 'tag');

        expect(getCurrentScope().getScopeData().tags).toEqual({ manual: 'tag', inner: 'tag' });
        expect(manualScope!.getScopeData().tags).toEqual({ manual: 'tag', 'manual-scope-inner': 'tag' });
      });

      // manualScope modifications remain set outside the callback
      expect(manualScope!.getScopeData().tags).toEqual({ manual: 'tag', 'manual-scope-inner': 'tag' });

      // current scope is reset back to initial scope
      expect(getCurrentScope()).toBe(initialScope);
      expect(getCurrentScope().getScopeData().tags).toEqual({ outer: 'tag' });

      // although the manual span is still running, it's no longer active due to being outside of the callback
      expect(getActiveSpan()).toBe(undefined);
    });

    it('allows to pass a parentSpan', () => {
      let parentSpan: Span;

      startSpanManual({ name: 'detached' }, span => {
        parentSpan = span;
      });

      startSpan({ name: 'GET users/[id]', parentSpan: parentSpan! }, span => {
        expect(getActiveSpan()).toBe(span);
        expect(spanToJSON(span).parent_span_id).toBe(parentSpan.spanContext().spanId);
      });

      expect(getActiveSpan()).toBe(undefined);
    });

    it('allows to pass parentSpan=null', () => {
      startSpan({ name: 'GET users/[id' }, () => {
        startSpan({ name: 'child', parentSpan: null }, span => {
          expect(spanToJSON(span).parent_span_id).toBe(undefined);
        });
      });
    });

    it('allows to add span links', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      // @ts-expect-error links exists on span
      expect(rawSpan1?.links).toEqual([]);

      const span1JSON = spanToJSON(rawSpan1);

      startSpan({ name: '/users/:id' }, rawSpan2 => {
        rawSpan2.addLink({
          context: rawSpan1.spanContext(),
          attributes: {
            'sentry.link.type': 'previous_trace',
          },
        });

        const span2LinkJSON = spanToJSON(rawSpan2).links?.[0];

        expect(span2LinkJSON?.attributes?.['sentry.link.type']).toBe('previous_trace');

        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.traceId).toEqual(rawSpan1._spanContext.traceId);
        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.traceId).toEqual(span1JSON.trace_id);
        expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.spanId).toEqual(rawSpan1?._spanContext.spanId);
        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.spanId).toEqual(span1JSON.span_id);
        expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);
      });
    });

    it('allows to pass span links in span options', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      // @ts-expect-error links exists on span
      expect(rawSpan1?.links).toEqual([]);

      const span1JSON = spanToJSON(rawSpan1);

      startSpan(
        {
          name: '/users/:id',
          links: [
            {
              context: rawSpan1.spanContext(),
              attributes: { 'sentry.link.type': 'previous_trace' },
            },
          ],
        },
        rawSpan2 => {
          const span2LinkJSON = spanToJSON(rawSpan2).links?.[0];

          expect(span2LinkJSON?.attributes?.['sentry.link.type']).toBe('previous_trace');

          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.traceId).toEqual(rawSpan1._spanContext.traceId);
          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.traceId).toEqual(span1JSON.trace_id);
          expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.spanId).toEqual(rawSpan1?._spanContext.spanId);
          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.spanId).toEqual(span1JSON.span_id);
          expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);
        },
      );
    });

    it('allows to force a transaction with forceTransaction=true', async () => {
      const client = getClient()!;
      const transactionEvents: Event[] = [];

      client.getOptions().beforeSendTransaction = event => {
        transactionEvents.push({
          ...event,
          sdkProcessingMetadata: {
            dynamicSamplingContext: event.sdkProcessingMetadata?.dynamicSamplingContext,
          },
        });
        return event;
      };

      startSpan({ name: 'outer transaction' }, () => {
        startSpan({ name: 'inner span' }, () => {
          startSpan({ name: 'inner transaction', forceTransaction: true }, () => {
            startSpan({ name: 'inner span 2' }, () => {
              // all good
            });
          });
        });
      });

      await client.flush();

      const normalizedTransactionEvents = transactionEvents.map(event => {
        return {
          ...event,
          spans: event.spans?.map(span => ({ name: span.description, id: span.span_id })),
        };
      });

      expect(normalizedTransactionEvents).toHaveLength(2);

      const outerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'outer transaction');
      const innerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'inner transaction');

      const outerTraceId = outerTransaction?.contexts?.trace?.trace_id;
      // The inner transaction should be a child of the last span of the outer transaction
      const innerParentSpanId = outerTransaction?.spans?.[0]?.id;
      const innerSpanId = innerTransaction?.contexts?.trace?.span_id;

      expect(outerTraceId).toBeDefined();
      expect(innerParentSpanId).toBeDefined();
      expect(innerSpanId).toBeDefined();
      // inner span ID should _not_ be the parent span ID, but the id of the new span
      expect(innerSpanId).not.toEqual(innerParentSpanId);

      expect(outerTransaction?.contexts?.trace).toEqual({
        data: {
          'sentry.source': 'custom',
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
        },
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        origin: 'manual',
        status: 'ok',
      });
      expect(outerTransaction?.spans).toEqual([{ name: 'inner span', id: expect.any(String) }]);
      expect(outerTransaction?.transaction).toEqual('outer transaction');
      expect(outerTransaction?.sdkProcessingMetadata).toEqual({
        dynamicSamplingContext: {
          environment: 'production',
          public_key: 'username',
          trace_id: outerTraceId,
          sample_rate: '1',
          transaction: 'outer transaction',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      });

      expect(innerTransaction?.contexts?.trace).toEqual({
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: outerTraceId,
        origin: 'manual',
        status: 'ok',
      });
      expect(innerTransaction?.spans).toEqual([{ name: 'inner span 2', id: expect.any(String) }]);
      expect(innerTransaction?.transaction).toEqual('inner transaction');
      expect(innerTransaction?.sdkProcessingMetadata).toEqual({
        dynamicSamplingContext: {
          environment: 'production',
          public_key: 'username',
          trace_id: outerTraceId,
          sample_rate: '1',
          transaction: 'outer transaction',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      });
    });

    // TODO: propagation scope is not picked up by spans...

    describe('onlyIfParent', () => {
      it('does not create a span if there is no parent', () => {
        const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        expect(isSpan(span)).toBe(false);
      });

      it('creates a span if there is a parent', () => {
        const span = startSpan({ name: 'parent span' }, () => {
          const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
            return span;
          });

          return span;
        });

        expect(isSpan(span)).toBe(true);
      });
    });
  });

  describe('startInactiveSpan', () => {
    it('works at the root', () => {
      const span = startInactiveSpan({ name: 'test' });

      expect(span).toBeDefined();
      expect(getSpanName(span)).toEqual('test');
      expect(getSpanEndTime(span)).toEqual([0, 0]);
      expect(getActiveSpan()).toBeUndefined();

      span.end();

      expect(getSpanEndTime(span)).not.toEqual([0, 0]);
      expect(getActiveSpan()).toBeUndefined();
    });

    it('works as a child span', () => {
      startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        expect(getActiveSpan()).toEqual(outerSpan);

        const innerSpan = startInactiveSpan({ name: 'test' });

        expect(innerSpan).toBeDefined();
        expect(getSpanName(innerSpan)).toEqual('test');
        expect(getSpanEndTime(innerSpan)).toEqual([0, 0]);
        expect(getActiveSpan()).toEqual(outerSpan);

        innerSpan.end();

        expect(getSpanEndTime(innerSpan)).not.toEqual([0, 0]);
        expect(getActiveSpan()).toEqual(outerSpan);
      });
    });

    it('allows to pass context arguments', () => {
      const span = startInactiveSpan({
        name: 'outer',
      });

      expect(span).toBeDefined();
      expect(getSpanAttributes(span)).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      });

      const span2 = startInactiveSpan({
        name: 'outer',
        op: 'my-op',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test.origin',
        },
      });

      expect(span2).toBeDefined();
      expect(getSpanAttributes(span2)).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test.origin',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'my-op',
      });
    });

    it('allows to pass base SpanOptions', () => {
      const date = [5000, 0] as TimeInput;

      const span = startInactiveSpan({
        name: 'outer',
        kind: SpanKind.CLIENT,
        attributes: {
          test1: 'test 1',
          test2: 2,
        },
        startTime: date,
      });

      expect(span).toBeDefined();
      expect(getSpanName(span)).toEqual('outer');
      expect(getSpanStartTime(span)).toEqual(date);
      expect(getSpanAttributes(span)).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        test1: 'test 1',
        test2: 2,
      });
      expect(getSpanKind(span)).toEqual(SpanKind.CLIENT);
    });

    it('allows to pass a startTime in seconds', () => {
      const startTime = 1708504860.961;
      const span = startInactiveSpan({ name: 'outer', startTime: startTime });

      expect(getSpanStartTime(span)).toEqual([1708504860, 961000000]);
    });

    it('allows to pass a scope', () => {
      const initialScope = getCurrentScope();

      let manualScope: Scope;

      const parentSpan = startSpanManual({ name: 'detached' }, span => {
        manualScope = getCurrentScope();
        manualScope.setTag('manual', 'tag');
        return span;
      });

      getCurrentScope().setTag('outer', 'tag');

      const span = startInactiveSpan({ name: 'GET users/[id]', scope: manualScope! });
      expect(getSpanParentSpanId(span)).toBe(parentSpan.spanContext().spanId);

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);
    });

    it('allows to pass a parentSpan', () => {
      let parentSpan: Span;

      startSpanManual({ name: 'detached' }, span => {
        parentSpan = span;
      });

      const span = startInactiveSpan({ name: 'GET users/[id]', parentSpan: parentSpan! });

      expect(getActiveSpan()).toBe(undefined);
      expect(spanToJSON(span).parent_span_id).toBe(parentSpan!.spanContext().spanId);

      expect(getActiveSpan()).toBe(undefined);
    });

    it('allows to pass parentSpan=null', () => {
      startSpan({ name: 'outer' }, () => {
        const span = startInactiveSpan({ name: 'test span', parentSpan: null });
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        span.end();
      });
    });

    it('allows to pass span links in span options', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      // @ts-expect-error links exists on span
      expect(rawSpan1?.links).toEqual([]);

      const rawSpan2 = startInactiveSpan({
        name: 'GET users/[id]',
        links: [
          {
            context: rawSpan1.spanContext(),
            attributes: { 'sentry.link.type': 'previous_trace' },
          },
        ],
      });

      const span1JSON = spanToJSON(rawSpan1);
      const span2JSON = spanToJSON(rawSpan2);
      const span2LinkJSON = span2JSON.links?.[0];

      expect(span2LinkJSON?.attributes?.['sentry.link.type']).toBe('previous_trace');

      // @ts-expect-error links and _spanContext exist on span
      expect(rawSpan2?.links?.[0].context.traceId).toEqual(rawSpan1._spanContext.traceId);
      // @ts-expect-error links and _spanContext exist on span
      expect(rawSpan2?.links?.[0].context.traceId).toEqual(span1JSON.trace_id);
      expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

      // @ts-expect-error links and _spanContext exist on span
      expect(rawSpan2?.links?.[0].context.spanId).toEqual(rawSpan1?._spanContext.spanId);
      // @ts-expect-error links and _spanContext exist on span
      expect(rawSpan2?.links?.[0].context.spanId).toEqual(span1JSON.span_id);
      expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);

      // sampling decision is inherited
      expect(span2LinkJSON?.sampled).toBe(Boolean(spanToJSON(rawSpan1).data['sentry.sample_rate']));
    });

    it('allows to force a transaction with forceTransaction=true', async () => {
      const client = getClient()!;
      const transactionEvents: Event[] = [];

      client.getOptions().beforeSendTransaction = event => {
        transactionEvents.push({
          ...event,
          sdkProcessingMetadata: {
            dynamicSamplingContext: event.sdkProcessingMetadata?.dynamicSamplingContext,
          },
        });
        return event;
      };

      startSpan({ name: 'outer transaction' }, () => {
        startSpan({ name: 'inner span' }, () => {
          const innerTransaction = startInactiveSpan({ name: 'inner transaction', forceTransaction: true });
          innerTransaction.end();
        });
      });

      await client.flush();

      const normalizedTransactionEvents = transactionEvents.map(event => {
        return {
          ...event,
          spans: event.spans?.map(span => ({ name: span.description, id: span.span_id })),
        };
      });

      expect(normalizedTransactionEvents).toHaveLength(2);

      const outerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'outer transaction');
      const innerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'inner transaction');

      const outerTraceId = outerTransaction?.contexts?.trace?.trace_id;
      // The inner transaction should be a child of the last span of the outer transaction
      const innerParentSpanId = outerTransaction?.spans?.[0]?.id;
      const innerSpanId = innerTransaction?.contexts?.trace?.span_id;

      expect(outerTraceId).toBeDefined();
      expect(innerParentSpanId).toBeDefined();
      expect(innerSpanId).toBeDefined();
      // inner span ID should _not_ be the parent span ID, but the id of the new span
      expect(innerSpanId).not.toEqual(innerParentSpanId);

      expect(outerTransaction?.contexts?.trace).toEqual({
        data: {
          'sentry.source': 'custom',
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
        },
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        origin: 'manual',
        status: 'ok',
      });
      expect(outerTransaction?.spans).toEqual([{ name: 'inner span', id: expect.any(String) }]);
      expect(outerTransaction?.transaction).toEqual('outer transaction');
      expect(outerTransaction?.sdkProcessingMetadata).toEqual({
        dynamicSamplingContext: {
          environment: 'production',
          public_key: 'username',
          trace_id: outerTraceId,
          sample_rate: '1',
          transaction: 'outer transaction',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      });

      expect(innerTransaction?.contexts?.trace).toEqual({
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: outerTraceId,
        origin: 'manual',
        status: 'ok',
      });
      expect(innerTransaction?.spans).toEqual([]);
      expect(innerTransaction?.transaction).toEqual('inner transaction');
      expect(innerTransaction?.sdkProcessingMetadata).toEqual({
        dynamicSamplingContext: {
          environment: 'production',
          public_key: 'username',
          trace_id: outerTraceId,
          sample_rate: '1',
          transaction: 'outer transaction',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      });
    });

    describe('onlyIfParent', () => {
      it('does not create a span if there is no parent', () => {
        const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

        expect(isSpan(span)).toBe(false);
      });

      it('creates a span if there is a parent', () => {
        const span = startSpan({ name: 'parent span' }, () => {
          const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

          return span;
        });

        expect(isSpan(span)).toBe(true);
      });
    });

    it('includes the scope at the time the span was started when finished', async () => {
      const beforeSendTransaction = vi.fn(event => event);

      const client = getClient()!;

      client.getOptions().beforeSendTransaction = beforeSendTransaction;

      let span: Span;

      const scope = getCurrentScope();
      scope.setTag('outer', 'foo');

      withScope(scope => {
        scope.setTag('scope', 1);
        span = startInactiveSpan({ name: 'my-span' });
        scope.setTag('scope_after_span', 2);
      });

      withScope(scope => {
        scope.setTag('scope', 2);
        span.end();
      });

      await client.flush();

      expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
      expect(beforeSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            outer: 'foo',
            scope: 1,
            scope_after_span: 2,
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('startSpanManual', () => {
    it('does not automatically finish the span', () => {
      expect(getActiveSpan()).toEqual(undefined);

      let _outerSpan: Span | undefined;
      let _innerSpan: Span | undefined;

      const res = startSpanManual({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        _outerSpan = outerSpan;

        expect(getSpanName(outerSpan)).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        startSpanManual({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          _innerSpan = innerSpan;

          expect(getSpanName(innerSpan)).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });

        expect(getSpanEndTime(_innerSpan!)).toEqual([0, 0]);

        _innerSpan!.end();

        expect(getSpanEndTime(_innerSpan!)).not.toEqual([0, 0]);

        return 'test value';
      });

      expect(getSpanEndTime(_outerSpan!)).toEqual([0, 0]);

      _outerSpan!.end();

      expect(getSpanEndTime(_outerSpan!)).not.toEqual([0, 0]);

      expect(res).toEqual('test value');

      expect(getActiveSpan()).toEqual(undefined);
    });

    it('allows to pass base SpanOptions', () => {
      const date = [5000, 0] as TimeInput;

      startSpanManual(
        {
          name: 'outer',
          kind: SpanKind.CLIENT,
          attributes: {
            test1: 'test 1',
            test2: 2,
          },
          startTime: date,
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanName(span)).toEqual('outer');
          expect(getSpanStartTime(span)).toEqual(date);
          expect(getSpanAttributes(span)).toEqual({
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            test1: 'test 1',
            test2: 2,
          });
          expect(getSpanKind(span)).toEqual(SpanKind.CLIENT);
        },
      );
    });

    it('allows to pass a startTime in seconds', () => {
      const startTime = 1708504860.961;
      const start = startSpanManual({ name: 'outer', startTime: startTime }, span => {
        const start = getSpanStartTime(span);
        span.end();
        return start;
      });

      expect(start).toEqual([1708504860, 961000000]);
    });

    it('allows to pass a scope', () => {
      const initialScope = getCurrentScope();

      let manualScope: Scope;
      let parentSpan: Span;

      startSpanManual({ name: 'detached' }, span => {
        parentSpan = span;
        manualScope = getCurrentScope();
        manualScope.setTag('manual', 'tag');
      });

      getCurrentScope().setTag('outer', 'tag');

      startSpanManual({ name: 'GET users/[id]', scope: manualScope! }, span => {
        expect(getCurrentScope()).not.toBe(initialScope);

        expect(getCurrentScope()).toEqual(manualScope);
        expect(getActiveSpan()).toBe(span);

        expect(getSpanParentSpanId(span)).toBe(parentSpan.spanContext().spanId);

        span.end();
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);
    });

    it('allows to pass a parentSpan', () => {
      let parentSpan: Span;

      startSpanManual({ name: 'detached' }, span => {
        parentSpan = span;
      });

      startSpanManual({ name: 'GET users/[id]', parentSpan: parentSpan! }, span => {
        expect(getActiveSpan()).toBe(span);
        expect(spanToJSON(span).parent_span_id).toBe(parentSpan.spanContext().spanId);

        span.end();
      });

      expect(getActiveSpan()).toBe(undefined);
    });

    it('allows to pass parentSpan=null', () => {
      startSpan({ name: 'outer' }, () => {
        startSpanManual({ name: 'GET users/[id]', parentSpan: null }, span => {
          expect(spanToJSON(span).parent_span_id).toBe(undefined);
          span.end();
        });
      });
    });

    it('allows to add span links', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      // @ts-expect-error links exists on span
      expect(rawSpan1?.links).toEqual([]);

      const span1JSON = spanToJSON(rawSpan1);

      startSpanManual({ name: '/users/:id' }, rawSpan2 => {
        rawSpan2.addLink({
          context: rawSpan1.spanContext(),
          attributes: {
            'sentry.link.type': 'previous_trace',
          },
        });

        const span2LinkJSON = spanToJSON(rawSpan2).links?.[0];

        expect(span2LinkJSON?.attributes?.['sentry.link.type']).toBe('previous_trace');

        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.traceId).toEqual(rawSpan1._spanContext.traceId);
        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.traceId).toEqual(span1JSON.trace_id);
        expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.spanId).toEqual(rawSpan1?._spanContext.spanId);
        // @ts-expect-error links and _spanContext exist on span
        expect(rawSpan2?.links?.[0].context.spanId).toEqual(span1JSON.span_id);
        expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);
      });
    });

    it('allows to pass span links in span options', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      // @ts-expect-error links exists on span
      expect(rawSpan1?.links).toEqual([]);

      const span1JSON = spanToJSON(rawSpan1);

      startSpanManual(
        {
          name: '/users/:id',
          links: [
            {
              context: rawSpan1.spanContext(),
              attributes: { 'sentry.link.type': 'previous_trace' },
            },
          ],
        },
        rawSpan2 => {
          const span2LinkJSON = spanToJSON(rawSpan2).links?.[0];

          expect(span2LinkJSON?.attributes?.['sentry.link.type']).toBe('previous_trace');

          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.traceId).toEqual(rawSpan1._spanContext.traceId);
          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.traceId).toEqual(span1JSON.trace_id);
          expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.spanId).toEqual(rawSpan1?._spanContext.spanId);
          // @ts-expect-error links and _spanContext exist on span
          expect(rawSpan2?.links?.[0].context.spanId).toEqual(span1JSON.span_id);
          expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);
        },
      );
    });

    it('allows to force a transaction with forceTransaction=true', async () => {
      const client = getClient()!;
      const transactionEvents: Event[] = [];

      client.getOptions().beforeSendTransaction = event => {
        transactionEvents.push({
          ...event,
          sdkProcessingMetadata: {
            dynamicSamplingContext: event.sdkProcessingMetadata?.dynamicSamplingContext,
          },
        });
        return event;
      };

      startSpanManual({ name: 'outer transaction' }, span => {
        startSpanManual({ name: 'inner span' }, span => {
          startSpanManual({ name: 'inner transaction', forceTransaction: true }, span => {
            startSpanManual({ name: 'inner span 2' }, span => {
              // all good
              span.end();
            });
            span.end();
          });
          span.end();
        });
        span.end();
      });

      await client.flush();

      const normalizedTransactionEvents = transactionEvents.map(event => {
        return {
          ...event,
          spans: event.spans?.map(span => ({ name: span.description, id: span.span_id })),
        };
      });

      expect(normalizedTransactionEvents).toHaveLength(2);

      const outerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'outer transaction');
      const innerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'inner transaction');

      const outerTraceId = outerTransaction?.contexts?.trace?.trace_id;
      // The inner transaction should be a child of the last span of the outer transaction
      const innerParentSpanId = outerTransaction?.spans?.[0]?.id;
      const innerSpanId = innerTransaction?.contexts?.trace?.span_id;

      expect(outerTraceId).toBeDefined();
      expect(innerParentSpanId).toBeDefined();
      expect(innerSpanId).toBeDefined();
      // inner span ID should _not_ be the parent span ID, but the id of the new span
      expect(innerSpanId).not.toEqual(innerParentSpanId);

      expect(outerTransaction?.contexts?.trace).toEqual({
        data: {
          'sentry.source': 'custom',
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
        },
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        origin: 'manual',
        status: 'ok',
      });
      expect(outerTransaction?.spans).toEqual([{ name: 'inner span', id: expect.any(String) }]);
      expect(outerTransaction?.transaction).toEqual('outer transaction');
      expect(outerTransaction?.sdkProcessingMetadata).toEqual({
        dynamicSamplingContext: {
          environment: 'production',
          public_key: 'username',
          trace_id: outerTraceId,
          sample_rate: '1',
          transaction: 'outer transaction',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      });

      expect(innerTransaction?.contexts?.trace).toEqual({
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: outerTraceId,
        origin: 'manual',
        status: 'ok',
      });
      expect(innerTransaction?.spans).toEqual([{ name: 'inner span 2', id: expect.any(String) }]);
      expect(innerTransaction?.transaction).toEqual('inner transaction');
      expect(innerTransaction?.sdkProcessingMetadata).toEqual({
        dynamicSamplingContext: {
          environment: 'production',
          public_key: 'username',
          trace_id: outerTraceId,
          sample_rate: '1',
          transaction: 'outer transaction',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      });
    });

    describe('onlyIfParent', () => {
      it('does not create a span if there is no parent', () => {
        const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        expect(isSpan(span)).toBe(false);
      });

      it('creates a span if there is a parent', () => {
        const span = startSpan({ name: 'parent span' }, () => {
          const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
            return span;
          });

          return span;
        });

        expect(isSpan(span)).toBe(true);
      });
    });
  });

  describe('propagation', () => {
    it('starts new trace, if there is no parent', () => {
      withScope(scope => {
        const propagationContext = scope.getPropagationContext();
        const span = startInactiveSpan({ name: 'test span' });

        expect(span).toBeDefined();
        const traceId = spanToJSON(span).trace_id;
        expect(traceId).toMatch(/[a-f0-9]{32}/);
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        expect(spanToJSON(span).trace_id).not.toEqual(propagationContext.traceId);

        expect(getDynamicSamplingContextFromSpan(span)).toEqual({
          trace_id: traceId,
          environment: 'production',
          public_key: 'username',
          sample_rate: '1',
          sampled: 'true',
          transaction: 'test span',
          sample_rand: expect.any(String),
        });
      });
    });

    // Note: This _should_ never happen, when we have an incoming trace, we should always have a parent span
    it('starts new trace, ignoring parentSpanId, if there is no parent', () => {
      withScope(scope => {
        const propagationContext = scope.getPropagationContext();
        propagationContext.parentSpanId = '1121201211212012';
        const span = startInactiveSpan({ name: 'test span' });

        expect(span).toBeDefined();
        const traceId = spanToJSON(span).trace_id;
        expect(traceId).toMatch(/[a-f0-9]{32}/);
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        expect(spanToJSON(span).trace_id).not.toEqual(propagationContext.traceId);

        expect(getDynamicSamplingContextFromSpan(span)).toEqual({
          environment: 'production',
          public_key: 'username',
          trace_id: traceId,
          sample_rate: '1',
          sampled: 'true',
          transaction: 'test span',
          sample_rand: expect.any(String),
        });
      });
    });

    it('picks up the trace context from the parent without DSC', () => {
      withScope(scope => {
        const propagationContext = scope.getPropagationContext();

        startSpan({ name: 'parent span' }, parentSpan => {
          const span = startInactiveSpan({ name: 'test span' });

          expect(span).toBeDefined();
          expect(spanToJSON(span).trace_id).toEqual(parentSpan.spanContext().traceId);
          expect(spanToJSON(span).parent_span_id).toEqual(parentSpan.spanContext().spanId);
          expect(getDynamicSamplingContextFromSpan(span)).toEqual({
            ...getDynamicSamplingContextFromClient(propagationContext.traceId, getClient()!),
            trace_id: parentSpan.spanContext().traceId,
            transaction: 'parent span',
            sampled: 'true',
            sample_rate: '1',
            sample_rand: expect.any(String),
          });
        });
      });
    });

    it('picks up the trace context from the parent with DSC', () => {
      withScope(() => {
        const ctx = trace.setSpanContext(ROOT_CONTEXT, {
          traceId: '12312012123120121231201212312012',
          spanId: '1121201211212012',
          isRemote: false,
          traceFlags: TraceFlags.SAMPLED,
          traceState: makeTraceState({
            dsc: {
              release: '1.0',
              environment: 'production',
            },
          }),
        });

        context.with(ctx, () => {
          const span = startInactiveSpan({ name: 'test span' });

          expect(span).toBeDefined();
          expect(spanToJSON(span).trace_id).toEqual('12312012123120121231201212312012');
          expect(spanToJSON(span).parent_span_id).toEqual('1121201211212012');
          expect(getDynamicSamplingContextFromSpan(span)).toEqual({
            release: '1.0',
            environment: 'production',
          });
        });
      });
    });

    it('picks up the trace context from a remote parent', () => {
      withScope(() => {
        const ctx = trace.setSpanContext(ROOT_CONTEXT, {
          traceId: '12312012123120121231201212312012',
          spanId: '1121201211212012',
          isRemote: true,
          traceFlags: TraceFlags.SAMPLED,
          traceState: makeTraceState({
            dsc: {
              release: '1.0',
              environment: 'production',
            },
          }),
        });

        context.with(ctx, () => {
          const span = startInactiveSpan({ name: 'test span' });

          expect(span).toBeDefined();
          expect(spanToJSON(span).trace_id).toEqual('12312012123120121231201212312012');
          expect(spanToJSON(span).parent_span_id).toEqual('1121201211212012');
          expect(getDynamicSamplingContextFromSpan(span)).toEqual({
            release: '1.0',
            environment: 'production',
          });
        });
      });
    });
  });

  describe('scope passing', () => {
    it('handles active span when passing scopes to withScope', () => {
      const [scope, span] = startSpan({ name: 'outer' }, span => {
        return [getCurrentScope(), span];
      });

      const spanOnScope = withScope(scope, () => {
        return getActiveSpan();
      });

      expect(spanOnScope).toBeDefined();
      expect(spanOnScope).toBe(span);
    });
  });
});

describe('trace (tracing disabled)', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 0 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('startSpan calls callback without span', () => {
    const val = startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(false);

      return 'test value';
    });

    expect(val).toEqual('test value');
  });

  it('startInactiveSpan returns a NonRecordinSpan', () => {
    const span = startInactiveSpan({ name: 'test' });

    expect(span).toBeDefined();
    expect(span.isRecording()).toBe(false);
  });
});

describe('trace (sampling)', () => {
  afterEach(async () => {
    await cleanupOtel();
    vi.clearAllMocks();
  });

  it('samples with a tracesSampleRate, when Math.random() > tracesSampleRate', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 0.5 });

    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(false);

      startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(false);
      });
    });
  });

  it('samples with a tracesSampleRate, when Math.random() < tracesSampleRate', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.4);

    mockSdkInit({ tracesSampleRate: 0.5 });

    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(true);
      // All fields are empty for NonRecordingSpan
      expect(getSpanName(outerSpan)).toBe('outer');

      startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(true);
        expect(getSpanName(innerSpan)).toBe('inner');
      });
    });
  });

  it('positive parent sampling takes precedence over tracesSampleRate', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 1 });

    // This will def. be sampled because of the tracesSampleRate
    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(true);
      expect(getSpanName(outerSpan)).toBe('outer');

      // Now let's mutate the tracesSampleRate so that the next entry _should_ not be sampled
      // but it will because of parent sampling
      const client = getClient();
      client!.getOptions().tracesSampleRate = 0.5;

      startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(true);
        expect(getSpanName(innerSpan)).toBe('inner');
      });
    });
  });

  it('negative parent sampling takes precedence over tracesSampleRate', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 0.5 });

    // This will def. be unsampled because of the tracesSampleRate
    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(false);

      // Now let's mutate the tracesSampleRate so that the next entry _should_ be sampled
      // but it will remain unsampled because of parent sampling
      const client = getClient();
      client!.getOptions().tracesSampleRate = 1;

      startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(false);
      });
    });
  });

  it('positive remote parent sampling takes precedence over tracesSampleRate', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 0.5 });

    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const spanContext = {
      traceId,
      spanId: parentSpanId,
      sampled: true,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
    };

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
      // This will def. be sampled because of the tracesSampleRate
      startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        expect(outerSpan.isRecording()).toBe(true);
        expect(getSpanName(outerSpan)).toBe('outer');
      });
    });
  });

  it('negative remote parent sampling takes precedence over tracesSampleRate', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 0.5 });

    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const spanContext = {
      traceId,
      spanId: parentSpanId,
      sampled: false,
      isRemote: true,
      traceFlags: TraceFlags.NONE,
    };

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
      // This will def. be sampled because of the tracesSampleRate
      startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        expect(outerSpan.isRecording()).toBe(false);
      });
    });
  });

  it('samples with a tracesSampler returning a boolean', () => {
    let tracesSamplerResponse: boolean = true;

    const tracesSampler = vi.fn(() => {
      return tracesSamplerResponse;
    });

    mockSdkInit({ tracesSampler });

    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      name: 'outer',
      attributes: {},
      inheritOrSampleWith: expect.any(Function),
    });

    // Now return `false`, it should not sample
    tracesSamplerResponse = false;

    startSpan({ name: 'outer2' }, outerSpan => {
      expect(outerSpan.isRecording()).toBe(false);

      startSpan({ name: 'inner2' }, innerSpan => {
        expect(innerSpan.isRecording()).toBe(false);
      });
    });

    expect(tracesSampler).toHaveBeenCalledTimes(2);
    expect(tracesSampler).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSampled: undefined,
        name: 'outer',
        attributes: {},
      }),
    );
    expect(tracesSampler).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSampled: undefined,
        name: 'outer2',
        attributes: {},
      }),
    );

    // Only root spans should go through the sampler
    expect(tracesSampler).not.toHaveBeenLastCalledWith({
      name: 'inner2',
    });
  });

  it('samples with a tracesSampler returning a number', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.6);

    let tracesSamplerResponse: number = 1;

    const tracesSampler = vi.fn(() => {
      return tracesSamplerResponse;
    });

    mockSdkInit({ tracesSampler });

    startSpan(
      {
        name: 'outer',
        op: 'test.op',
        attributes: { attr1: 'yes', attr2: 1 },
      },
      outerSpan => {
        expect(outerSpan).toBeDefined();
      },
    );

    expect(tracesSampler).toHaveBeenCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      name: 'outer',
      attributes: {
        attr1: 'yes',
        attr2: 1,
        'sentry.op': 'test.op',
      },
      inheritOrSampleWith: expect.any(Function),
    });

    // Now return `0`, it should not sample
    tracesSamplerResponse = 0;

    startSpan({ name: 'outer2' }, outerSpan => {
      expect(outerSpan.isRecording()).toBe(false);

      startSpan({ name: 'inner2' }, innerSpan => {
        expect(innerSpan.isRecording()).toBe(false);
      });
    });

    expect(tracesSampler).toHaveBeenCalledTimes(2);
    expect(tracesSampler).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSampled: undefined,
        name: 'outer2',
        attributes: {},
      }),
    );

    // Only root spans should be passed to tracesSampler
    expect(tracesSampler).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'inner2',
      }),
    );

    // Now return `0.4`, it should not sample
    tracesSamplerResponse = 0.4;

    startSpan({ name: 'outer3' }, outerSpan => {
      expect(outerSpan.isRecording()).toBe(false);
    });

    expect(tracesSampler).toHaveBeenCalledTimes(3);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      name: 'outer3',
      attributes: {},
      inheritOrSampleWith: expect.any(Function),
    });
  });

  it('samples with a tracesSampler even if parent is remotely sampled', () => {
    const tracesSampler = vi.fn(() => {
      return false;
    });

    mockSdkInit({ tracesSampler });
    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const spanContext = {
      traceId,
      spanId: parentSpanId,
      sampled: true,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
    };

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
      // This will def. be sampled because of the tracesSampleRate
      startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan.isRecording()).toBe(false);
      });
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: true,
      name: 'outer',
      attributes: {},
      inheritOrSampleWith: expect.any(Function),
    });
  });

  it('ignores parent span context if it is invalid', () => {
    mockSdkInit({ tracesSampleRate: 1 });
    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';

    const spanContext = {
      traceId,
      spanId: 'INVALID',
      traceFlags: TraceFlags.SAMPLED,
    };

    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
      startSpan({ name: 'outer' }, span => {
        expect(span.isRecording()).toBe(true);
        expect(span.spanContext().spanId).not.toBe('INVALID');
        expect(span.spanContext().spanId).toMatch(/[a-f0-9]{16}/);
        expect(span.spanContext().traceId).not.toBe(traceId);
        expect(span.spanContext().traceId).toMatch(/[a-f0-9]{32}/);
      });
    });
  });
});

describe('HTTP methods (sampling)', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('does sample when HTTP method is other than OPTIONS or HEAD', () => {
    const spanGET = startSpanManual({ name: 'test span', attributes: { [SEMATTRS_HTTP_METHOD]: 'GET' } }, span => {
      return span;
    });
    expect(spanIsSampled(spanGET)).toBe(true);
    expect(getSamplingDecision(spanGET.spanContext())).toBe(true);

    const spanPOST = startSpanManual({ name: 'test span', attributes: { [SEMATTRS_HTTP_METHOD]: 'POST' } }, span => {
      return span;
    });
    expect(spanIsSampled(spanPOST)).toBe(true);
    expect(getSamplingDecision(spanPOST.spanContext())).toBe(true);

    const spanPUT = startSpanManual({ name: 'test span', attributes: { [SEMATTRS_HTTP_METHOD]: 'PUT' } }, span => {
      return span;
    });
    expect(spanIsSampled(spanPUT)).toBe(true);
    expect(getSamplingDecision(spanPUT.spanContext())).toBe(true);

    const spanDELETE = startSpanManual(
      { name: 'test span', attributes: { [SEMATTRS_HTTP_METHOD]: 'DELETE' } },
      span => {
        return span;
      },
    );
    expect(spanIsSampled(spanDELETE)).toBe(true);
    expect(getSamplingDecision(spanDELETE.spanContext())).toBe(true);
  });

  it('does not sample when HTTP method is OPTIONS', () => {
    const span = startSpanManual({ name: 'test span', attributes: { [SEMATTRS_HTTP_METHOD]: 'OPTIONS' } }, span => {
      return span;
    });
    expect(spanIsSampled(span)).toBe(false);
    expect(getSamplingDecision(span.spanContext())).toBe(false);
  });

  it('does not sample when HTTP method is HEAD', () => {
    const span = startSpanManual({ name: 'test span', attributes: { [SEMATTRS_HTTP_METHOD]: 'HEAD' } }, span => {
      return span;
    });
    expect(spanIsSampled(span)).toBe(false);
    expect(getSamplingDecision(span.spanContext())).toBe(false);
  });
});

describe('continueTrace', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('works without trace & baggage data', () => {
    const scope = continueTrace({ sentryTrace: undefined, baggage: undefined }, () => {
      const span = getActiveSpan()!;
      expect(span).toBeUndefined();
      return getCurrentScope();
    });

    expect(scope.getPropagationContext()).toEqual({
      traceId: expect.any(String),
      sampleRand: expect.any(Number),
    });

    expect(scope.getScopeData().sdkProcessingMetadata).toEqual({});
  });

  it('works with trace data', () => {
    continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      () => {
        const span = getActiveSpan()!;
        expect(span).toBeDefined();
        expect(spanToJSON(span)).toEqual({
          span_id: '1121201211212012',
          trace_id: '12312012123120121231201212312012',
          data: {},
          start_timestamp: 0,
        });
        expect(getSamplingDecision(span.spanContext())).toBe(false);
        expect(spanIsSampled(span)).toBe(false);
      },
    );
  });

  it('works with trace & baggage data', () => {
    continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production',
      },
      () => {
        const span = getActiveSpan()!;
        expect(span).toBeDefined();
        expect(spanToJSON(span)).toEqual({
          span_id: '1121201211212012',
          trace_id: '12312012123120121231201212312012',
          data: {},
          start_timestamp: 0,
        });
        expect(getSamplingDecision(span.spanContext())).toBe(true);
        expect(spanIsSampled(span)).toBe(true);
      },
    );
  });

  it('works with trace & 3rd party baggage data', () => {
    continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production,dogs=great,cats=boring',
      },
      () => {
        const span = getActiveSpan()!;
        expect(span).toBeDefined();
        expect(spanToJSON(span)).toEqual({
          span_id: '1121201211212012',
          trace_id: '12312012123120121231201212312012',
          data: {},
          start_timestamp: 0,
        });
        expect(getSamplingDecision(span.spanContext())).toBe(true);
        expect(spanIsSampled(span)).toBe(true);
      },
    );
  });

  it('returns response of callback', () => {
    const result = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      () => {
        return 'aha';
      },
    );

    expect(result).toEqual('aha');
  });
});

describe('suppressTracing', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('works for a root span', () => {
    const span = suppressTracing(() => {
      return startInactiveSpan({ name: 'span' });
    });

    expect(span.isRecording()).toBe(false);
    expect(spanIsSampled(span)).toBe(false);
  });

  it('works for a child span', () => {
    startSpan({ name: 'outer' }, span => {
      expect(span.isRecording()).toBe(true);
      expect(spanIsSampled(span)).toBe(true);

      const child1 = startInactiveSpan({ name: 'inner1' });

      expect(child1.isRecording()).toBe(true);
      expect(spanIsSampled(child1)).toBe(true);

      const child2 = suppressTracing(() => {
        return startInactiveSpan({ name: 'span' });
      });

      expect(child2.isRecording()).toBe(false);
      expect(spanIsSampled(child2)).toBe(false);
    });
  });

  it('works for a child span with forceTransaction=true', () => {
    startSpan({ name: 'outer' }, span => {
      expect(span.isRecording()).toBe(true);
      expect(spanIsSampled(span)).toBe(true);

      const child = suppressTracing(() => {
        return startInactiveSpan({ name: 'span', forceTransaction: true });
      });

      expect(child.isRecording()).toBe(false);
      expect(spanIsSampled(child)).toBe(false);
    });
  });

  it('works with parallel processes', async () => {
    const span = suppressTracing(() => {
      return startInactiveSpan({ name: 'span' });
    });

    const span2Promise = suppressTracing(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return startInactiveSpan({ name: 'span2' });
    });

    const span3Promise = suppressTracing(async () => {
      const span = startInactiveSpan({ name: 'span3' });
      await new Promise(resolve => setTimeout(resolve, 100));
      return span;
    });

    const span4 = suppressTracing(() => {
      return startInactiveSpan({ name: 'span' });
    });

    const span5 = startInactiveSpan({ name: 'span5' });

    const span2 = await span2Promise;
    const span3 = await span3Promise;

    expect(spanIsSampled(span)).toBe(false);
    expect(spanIsSampled(span2)).toBe(false);
    expect(spanIsSampled(span3)).toBe(false);
    expect(spanIsSampled(span4)).toBe(false);
    expect(spanIsSampled(span5)).toBe(true);
  });
});

function getSpanName(span: AbstractSpan): string | undefined {
  return spanHasName(span) ? span.name : undefined;
}

function getSpanEndTime(span: AbstractSpan): [number, number] | undefined {
  return (span as ReadableSpan).endTime;
}

function getSpanStartTime(span: AbstractSpan): [number, number] | undefined {
  return (span as ReadableSpan).startTime;
}

function getSpanAttributes(span: AbstractSpan): Record<string, unknown> | undefined {
  return spanHasAttributes(span) ? span.attributes : undefined;
}

function getSpanParentSpanId(span: AbstractSpan): string | undefined {
  return getParentSpanId(span as ReadableSpan);
}
