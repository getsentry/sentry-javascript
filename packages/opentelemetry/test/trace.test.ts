/* eslint-disable typescript/no-deprecated */
import type { Span, TimeInput } from '@opentelemetry/api';
import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { SENTRY_KIND } from '@sentry/conventions/attributes';
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
  spanToJSON,
  withScope,
} from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startInactiveSpan, startSpan, startSpanManual } from '../src/trace';
import { getActiveSpan } from '../src/utils/getActiveSpan';
import { makeTraceState } from '../src/utils/makeTraceState';
import { isSpan } from './helpers/isSpan';
import { mockSdkInit } from './helpers/mockSdkInit';

describe('trace', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
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
          attributes: {
            test1: 'test 1',
            test2: 2,
            [SENTRY_KIND]: 'client',
          },
          startTime: date,
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanName(span)).toEqual('outer');
          expect(getSpanStartTime(span)).toEqual(date);
          expect(getSpanAttributes(span)).toEqual({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
            test1: 'test 1',
            test2: 2,
            [SENTRY_KIND]: 'client',
          });
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

      expect(spanToJSON(rawSpan1).links).toBeUndefined();

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

        expect(span2LinkJSON?.trace_id).toEqual(rawSpan1.spanContext().traceId);
        expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

        expect(span2LinkJSON?.span_id).toEqual(rawSpan1.spanContext().spanId);
        expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);
      });
    });

    it('allows to pass span links in span options', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      expect(spanToJSON(rawSpan1).links).toBeUndefined();

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

          expect(span2LinkJSON?.trace_id).toEqual(rawSpan1.spanContext().traceId);
          expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

          expect(span2LinkJSON?.span_id).toEqual(rawSpan1.spanContext().spanId);
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
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
          'sentry.source': 'custom',
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
          'sentry.origin': 'manual',
          'sentry.source': 'custom',
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
      it('does not create a span and records no_parent_span client report if there is no parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        expect(span.isRecording()).toBe(false);
        expect(spyOnDroppedEvent).toHaveBeenCalledWith('no_parent_span', 'span');
        expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
      });

      it('creates a span if there is a parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        const span = startSpan({ name: 'parent span' }, () => {
          const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
            return span;
          });

          return span;
        });

        expect(isSpan(span)).toBe(true);
        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
      });

      it('does not record no_parent_span client report when onlyIfParent is not set', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        context.with(ROOT_CONTEXT, () => {
          startSpan({ name: 'root span without onlyIfParent' }, span => {
            return span;
          });
        });

        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
      });

      it('does not record no_parent_span client report when onlyIfParent is false even without a parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        context.with(ROOT_CONTEXT, () => {
          startSpan({ name: 'root span', onlyIfParent: false }, span => {
            return span;
          });
        });

        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
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
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
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
        attributes: {
          test1: 'test 1',
          test2: 2,
          [SENTRY_KIND]: 'client',
        },
        startTime: date,
      });

      expect(span).toBeDefined();
      expect(getSpanName(span)).toEqual('outer');
      expect(getSpanStartTime(span)).toEqual(date);
      expect(getSpanAttributes(span)).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        test1: 'test 1',
        test2: 2,
        [SENTRY_KIND]: 'client',
      });
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

      expect(spanToJSON(rawSpan1).links).toBeUndefined();

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

      expect(span2LinkJSON?.trace_id).toEqual(rawSpan1.spanContext().traceId);
      expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

      expect(span2LinkJSON?.span_id).toEqual(rawSpan1.spanContext().spanId);
      expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);

      // sampling decision is inherited
      expect(span2LinkJSON?.sampled).toBe(Boolean(spanToJSON(rawSpan1).attributes['sentry.sample_rate']));
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
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
          'sentry.source': 'custom',
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
          'sentry.origin': 'manual',
          'sentry.source': 'custom',
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
      it('does not create a span and records no_parent_span client report if there is no parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

        expect(span.isRecording()).toBe(false);
        expect(spyOnDroppedEvent).toHaveBeenCalledWith('no_parent_span', 'span');
        expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
      });

      it('creates a span if there is a parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        const span = startSpan({ name: 'parent span' }, () => {
          const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

          return span;
        });

        expect(isSpan(span)).toBe(true);
        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
      });

      it('does not record no_parent_span client report when onlyIfParent is not set', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        context.with(ROOT_CONTEXT, () => {
          const span = startInactiveSpan({ name: 'root span without onlyIfParent' });
          span.end();
        });

        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
      });

      it('does not record no_parent_span client report when onlyIfParent is false even without a parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        context.with(ROOT_CONTEXT, () => {
          const span = startInactiveSpan({ name: 'root span', onlyIfParent: false });
          span.end();
        });

        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
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
        // Set after the span was started: the span captures a snapshot of the scope at start time,
        // so this later mutation is intentionally not reflected on the transaction.
        scope.setTag('scope_after_span', 2);
      });

      withScope(scope => {
        scope.setTag('scope', 2);
        span.end();
      });

      await client.flush();

      expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
      const transactionEvent = beforeSendTransaction.mock.calls[0]![0];
      // Only the scope state at span-start is captured: `outer` and `scope: 1`, but not
      // `scope_after_span` (set later) or `scope: 2` (a different scope active at `end()`).
      expect(transactionEvent.tags).toEqual({ outer: 'foo', scope: 1 });
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
          attributes: {
            test1: 'test 1',
            test2: 2,
            [SENTRY_KIND]: 'client',
          },
          startTime: date,
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanName(span)).toEqual('outer');
          expect(getSpanStartTime(span)).toEqual(date);
          expect(getSpanAttributes(span)).toEqual({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
            test1: 'test 1',
            test2: 2,
            [SENTRY_KIND]: 'client',
          });
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

      expect(spanToJSON(rawSpan1).links).toBeUndefined();

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

        expect(span2LinkJSON?.trace_id).toEqual(rawSpan1.spanContext().traceId);
        expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

        expect(span2LinkJSON?.span_id).toEqual(rawSpan1.spanContext().spanId);
        expect(span2LinkJSON?.span_id).toBe(span1JSON.span_id);
      });
    });

    it('allows to pass span links in span options', () => {
      const rawSpan1 = startInactiveSpan({ name: 'pageload_span' });

      expect(spanToJSON(rawSpan1).links).toBeUndefined();

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

          expect(span2LinkJSON?.trace_id).toEqual(rawSpan1.spanContext().traceId);
          expect(span2LinkJSON?.trace_id).toBe(span1JSON.trace_id);

          expect(span2LinkJSON?.span_id).toEqual(rawSpan1.spanContext().spanId);
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
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
          'sentry.source': 'custom',
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
          'sentry.origin': 'manual',
          'sentry.source': 'custom',
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
      it('does not create a span and records no_parent_span client report if there is no parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        expect(span.isRecording()).toBe(false);
        expect(spyOnDroppedEvent).toHaveBeenCalledWith('no_parent_span', 'span');
        expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
      });

      it('creates a span if there is a parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        const span = startSpan({ name: 'parent span' }, () => {
          const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
            return span;
          });

          return span;
        });

        expect(isSpan(span)).toBe(true);
        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
      });

      it('does not record no_parent_span client report when onlyIfParent is not set', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        context.with(ROOT_CONTEXT, () => {
          startSpanManual({ name: 'root span without onlyIfParent' }, span => {
            span.end();
            return span;
          });
        });

        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
      });

      it('does not record no_parent_span client report when onlyIfParent is false even without a parent', () => {
        const client = getClient()!;
        const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');

        context.with(ROOT_CONTEXT, () => {
          startSpanManual({ name: 'root span', onlyIfParent: false }, span => {
            span.end();
            return span;
          });
        });

        expect(spyOnDroppedEvent).not.toHaveBeenCalledWith('no_parent_span', 'span');
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
        // A root span without a parent continues the current scope's propagation context trace,
        // matching the core SDK behavior.
        expect(spanToJSON(span).trace_id).toEqual(propagationContext.traceId);

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

    it('continues the scope propagation context, including parentSpanId, if there is no active span', () => {
      withScope(scope => {
        const propagationContext = scope.getPropagationContext();
        propagationContext.parentSpanId = '1121201211212012';
        const span = startInactiveSpan({ name: 'test span' });

        expect(span).toBeDefined();
        const traceId = spanToJSON(span).trace_id;
        expect(traceId).toMatch(/[a-f0-9]{32}/);
        // The root span continues the scope's trace and inherits the propagation context's
        // parentSpanId as its parent, matching the core SDK behavior.
        expect(spanToJSON(span).parent_span_id).toBe('1121201211212012');
        expect(spanToJSON(span).trace_id).toEqual(propagationContext.traceId);

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

describe('trace (spans disabled)', () => {
  beforeEach(() => {
    // Initialize SDK without any tracing configuration (no tracesSampleRate or tracesSampler)
    mockSdkInit({ tracesSampleRate: undefined, tracesSampler: undefined });
  });

  it('startSpan creates non-recording spans when hasSpansEnabled() === false', () => {
    const val = startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(false);

      // Nested spans should also be non-recording
      return startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(false);
        return 'test value';
      });
    });

    expect(val).toEqual('test value');
  });

  it('startSpanManual creates non-recording spans when hasSpansEnabled() === false', () => {
    const val = startSpanManual({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(false);

      return startSpanManual({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(false);
        return 'test value';
      });
    });

    expect(val).toEqual('test value');
  });

  it('startInactiveSpan returns non-recording spans when hasSpansEnabled() === false', () => {
    const span = startInactiveSpan({ name: 'test' });

    expect(span).toBeDefined();
    expect(span.isRecording()).toBe(false);
  });
});

describe('trace (sampling)', () => {
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

describe('span.end() timestamp conversion', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  it('converts seconds to milliseconds for startInactiveSpan', () => {
    // +10s buffer (see startInactiveSpan test above): avoids OTel's endTime-before-startTime clamp.
    const nowSec = Math.floor(Date.now() / 1000) + 10;
    const span = startInactiveSpan({ name: 'test' });
    span.end(nowSec);

    const endTime = getSpanEndTime(span);
    // ensureTimestampInMilliseconds converts seconds (< 9999999999) to ms by * 1000
    // OTel then converts ms to HrTime [seconds, nanoseconds]
    expect(endTime![0]).toBe(nowSec);
    expect(endTime![1]).toBe(0);
  });

  it('keeps milliseconds as-is for startInactiveSpan', () => {
    // Timestamp already in milliseconds (> 9999999999 threshold)
    const nowMs = Date.now() + 1000;
    const nowSec = Math.floor(nowMs / 1000);
    const span = startInactiveSpan({ name: 'test' });
    span.end(nowMs);

    const endTime = getSpanEndTime(span);
    expect(endTime![0]).toBe(nowSec);
  });

  it('handles Date input for startInactiveSpan', () => {
    const nowMs = Date.now() + 1000;
    const nowSec = Math.floor(nowMs / 1000);
    const span = startInactiveSpan({ name: 'test' });
    span.end(new Date(nowMs));

    const endTime = getSpanEndTime(span);
    expect(endTime![0]).toBe(nowSec);
  });

  it('handles no-arg end for startInactiveSpan', () => {
    const span = startInactiveSpan({ name: 'test' });
    span.end();

    const endTime = getSpanEndTime(span);
    expect(endTime).toBeDefined();
    expect(endTime![0]).not.toBe(0);
  });

  // +10s buffer: if the wallclock rolls past the next-second boundary between computing
  // nowSec and creating the span, `endTime = [nowSec, 0]` is < startTime, OTel clamps
  // endTime to startTime, and `endTime[1]` ends up at the startTime's nanos rather than 0.
  describe('span.end() timestamp conversion', () => {
    it('handles HrTime input for startInactiveSpan', () => {
      const nowSec = Math.floor(Date.now() / 1000) + 10;
      const span = startInactiveSpan({ name: 'test' });
      span.end([nowSec, 500000000] as [number, number]);

      const endTime = getSpanEndTime(span);
      expect(endTime![0]).toBe(nowSec);
      expect(endTime![1]).toBe(500000000);
    });

    it('converts seconds to milliseconds for startSpanManual callback span', () => {
      const nowSec = Math.floor(Date.now() / 1000) + 10;
      startSpanManual({ name: 'test' }, span => {
        span.end(nowSec);

        const endTime = getSpanEndTime(span);
        expect(endTime![0]).toBe(nowSec);
        expect(endTime![1]).toBe(0);
      });
    });

    it('converts seconds to milliseconds for startSpan child span', () => {
      const nowSec = Math.floor(Date.now() / 1000) + 10;
      let capturedEndTime: [number, number] | undefined;
      startSpan({ name: 'outer' }, () => {
        const innerSpan = startInactiveSpan({ name: 'inner' });
        innerSpan.end(nowSec);
        capturedEndTime = getSpanEndTime(innerSpan);
      });

      expect(capturedEndTime![0]).toBe(nowSec);
      expect(capturedEndTime![1]).toBe(0);
    });
  });
});

function getSpanName(span: Span): string | undefined {
  return spanToJSON(span).name;
}

// Native Sentry spans store timestamps in seconds; the tests assert HrTime `[seconds, nanoseconds]`.
// Convert via milliseconds (like OTel's `numberToHrtime`) so the nanosecond part stays exact —
// converting straight from a fractional-seconds double loses precision.
function hrTimeFromSeconds(seconds: number): [number, number] {
  const ms = seconds * 1000;
  const sec = Math.trunc(ms / 1000);
  return [sec, Math.round((ms - sec * 1000) * 1e6)];
}

function getSpanEndTime(span: Span): [number, number] | undefined {
  const endTimestamp = spanToJSON(span).end_timestamp;
  return typeof endTimestamp === 'number' ? hrTimeFromSeconds(endTimestamp) : [0, 0];
}

function getSpanStartTime(span: Span): [number, number] | undefined {
  const startTimestamp = spanToJSON(span).start_timestamp;
  return typeof startTimestamp === 'number' ? hrTimeFromSeconds(startTimestamp) : undefined;
}

function getSpanAttributes(span: Span): Record<string, unknown> | undefined {
  return spanToJSON(span).attributes;
}

function getSpanParentSpanId(span: Span): string | undefined {
  return spanToJSON(span).parent_span_id;
}
