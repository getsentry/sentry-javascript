import { context, trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { type Span, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startSpanManual } from '../src/trace';
import { tracingChannel } from '../src/tracingChannel';
import { getActiveSpan } from '../src/utils/getActiveSpan';
import { getParentSpanId } from '../src/utils/getParentSpanId';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

describe('tracingChannel', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('sets the created span as the active span inside traceSync', () => {
    const channel = tracingChannel<{ op: string }>('test:sync:active', data => {
      return startSpanManual({ name: 'channel-span', op: data.op }, span => span);
    });

    channel.subscribe({
      end: data => {
        data._sentrySpan?.end();
      },
    });

    channel.traceSync(
      () => {
        const active = getActiveSpan();
        expect(active).toBeDefined();
        expect(spanToJSON(active!).op).toBe('test.op');
      },
      { op: 'test.op' },
    );
  });

  it('sets the created span as the active span inside tracePromise', async () => {
    const channel = tracingChannel<{ op: string }>('test:promise:active', data => {
      return startSpanManual({ name: 'channel-span', op: data.op }, span => span);
    });

    channel.subscribe({
      asyncEnd: data => {
        data._sentrySpan?.end();
      },
    });

    await channel.tracePromise(
      async () => {
        const active = getActiveSpan();
        expect(active).toBeDefined();
        expect(spanToJSON(active!).op).toBe('test.op');
      },
      { op: 'test.op' },
    );
  });

  it('creates correct parent-child relationship with nested tracing channels', () => {
    const outerChannel = tracingChannel<{ name: string }>('test:nested:outer', data => {
      return startSpanManual({ name: data.name, op: 'outer' }, span => span);
    });

    const innerChannel = tracingChannel<{ name: string }>('test:nested:inner', data => {
      return startSpanManual({ name: data.name, op: 'inner' }, span => span);
    });

    outerChannel.subscribe({
      end: data => {
        data._sentrySpan?.end();
      },
    });

    innerChannel.subscribe({
      end: data => {
        data._sentrySpan?.end();
      },
    });

    let outerSpanId: string | undefined;
    let innerParentSpanId: string | undefined;

    outerChannel.traceSync(
      () => {
        const outerSpan = getActiveSpan();
        outerSpanId = outerSpan?.spanContext().spanId;

        innerChannel.traceSync(
          () => {
            const innerSpan = getActiveSpan();
            innerParentSpanId = getParentSpanId(innerSpan as unknown as ReadableSpan);
          },
          { name: 'inner-span' },
        );
      },
      { name: 'outer-span' },
    );

    expect(outerSpanId).toBeDefined();
    expect(innerParentSpanId).toBe(outerSpanId);
  });

  it('creates correct parent-child relationship with nested async tracing channels', async () => {
    const outerChannel = tracingChannel<{ name: string }>('test:nested-async:outer', data => {
      return startSpanManual({ name: data.name, op: 'outer' }, span => span);
    });

    const innerChannel = tracingChannel<{ name: string }>('test:nested-async:inner', data => {
      return startSpanManual({ name: data.name, op: 'inner' }, span => span);
    });

    outerChannel.subscribe({
      asyncEnd: data => {
        data._sentrySpan?.end();
      },
    });

    innerChannel.subscribe({
      asyncEnd: data => {
        data._sentrySpan?.end();
      },
    });

    let outerSpanId: string | undefined;
    let innerParentSpanId: string | undefined;

    await outerChannel.tracePromise(
      async () => {
        const outerSpan = getActiveSpan();
        outerSpanId = outerSpan?.spanContext().spanId;

        await innerChannel.tracePromise(
          async () => {
            const innerSpan = getActiveSpan();
            innerParentSpanId = getParentSpanId(innerSpan as unknown as ReadableSpan);
          },
          { name: 'inner-span' },
        );
      },
      { name: 'outer-span' },
    );

    expect(outerSpanId).toBeDefined();
    expect(innerParentSpanId).toBe(outerSpanId);
  });

  it('creates correct parent when a tracing channel is nested inside startSpanManual', () => {
    const channel = tracingChannel<{ name: string }>('test:inside-startspan', data => {
      return startSpanManual({ name: data.name, op: 'channel' }, span => span);
    });

    channel.subscribe({
      end: data => {
        data._sentrySpan?.end();
      },
    });

    let manualSpanId: string | undefined;
    let channelParentSpanId: string | undefined;

    startSpanManual({ name: 'manual-parent' }, parentSpan => {
      manualSpanId = parentSpan.spanContext().spanId;

      channel.traceSync(
        () => {
          const channelSpan = getActiveSpan();
          channelParentSpanId = getParentSpanId(channelSpan as unknown as ReadableSpan);
        },
        { name: 'channel-child' },
      );

      parentSpan.end();
    });

    expect(manualSpanId).toBeDefined();
    expect(channelParentSpanId).toBe(manualSpanId);
  });

  it('makes the channel span available on data.span', () => {
    let spanFromData: unknown;

    const channel = tracingChannel<{ name: string }>('test:data-span', data => {
      return startSpanManual({ name: data.name }, span => span);
    });

    channel.subscribe({
      end: data => {
        spanFromData = data._sentrySpan;
        data._sentrySpan?.end();
      },
    });

    channel.traceSync(() => {}, { name: 'test-span' });

    expect(spanFromData).toBeDefined();
    expect(spanToJSON(spanFromData as unknown as Span).description).toBe('test-span');
  });

  it('shares the same trace ID across nested channels', () => {
    const outerChannel = tracingChannel<{ name: string }>('test:trace-id:outer', data => {
      return startSpanManual({ name: data.name }, span => span);
    });

    const innerChannel = tracingChannel<{ name: string }>('test:trace-id:inner', data => {
      return startSpanManual({ name: data.name }, span => span);
    });

    outerChannel.subscribe({ end: data => data._sentrySpan?.end() });
    innerChannel.subscribe({ end: data => data._sentrySpan?.end() });

    let outerTraceId: string | undefined;
    let innerTraceId: string | undefined;

    outerChannel.traceSync(
      () => {
        outerTraceId = getActiveSpan()?.spanContext().traceId;

        innerChannel.traceSync(
          () => {
            innerTraceId = getActiveSpan()?.spanContext().traceId;
          },
          { name: 'inner' },
        );
      },
      { name: 'outer' },
    );

    expect(outerTraceId).toBeDefined();
    expect(innerTraceId).toBe(outerTraceId);
  });

  it('does not leak context outside of traceSync', () => {
    const channel = tracingChannel<{ name: string }>('test:no-leak', data => {
      return startSpanManual({ name: data.name }, span => span);
    });

    channel.subscribe({ end: data => data._sentrySpan?.end() });

    const activeBefore = trace.getSpan(context.active());

    channel.traceSync(() => {}, { name: 'scoped-span' });

    const activeAfter = trace.getSpan(context.active());

    expect(activeBefore).toBeUndefined();
    expect(activeAfter).toBeUndefined();
  });
});
