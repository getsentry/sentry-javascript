import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { TraceFlags, context, trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { PropagationContext } from '@sentry/types';

import { getCurrentHub } from '../src/custom/hub';
import { InternalSentrySemanticAttributes } from '../src/semanticAttributes';
import { startInactiveSpan, startSpan, startSpanManual } from '../src/trace';
import type { AbstractSpan } from '../src/types';
import { setPropagationContextOnContext } from '../src/utils/contextData';
import { getActiveSpan, getRootSpan } from '../src/utils/getActiveSpan';
import { getSpanKind } from '../src/utils/getSpanKind';
import { getSpanMetadata } from '../src/utils/spanData';
import { spanHasAttributes, spanHasName } from '../src/utils/spanTypes';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

describe('trace', () => {
  beforeEach(() => {
    mockSdkInit({ enableTracing: true });
  });

  afterEach(() => {
    cleanupOtel();
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
      const [outerSpan, innerSpan] = spans;

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
      const [outerSpan, innerSpan] = spans;

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
            [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
          });

          expect(getSpanMetadata(span)).toEqual(undefined);
        },
      );

      startSpan(
        {
          name: 'outer',
          op: 'my-op',
          origin: 'auto.test.origin',
          source: 'task',
          metadata: { requestPath: 'test-path' },
        },
        span => {
          expect(span).toBeDefined();
          expect(getSpanAttributes(span)).toEqual({
            [InternalSentrySemanticAttributes.SOURCE]: 'task',
            [InternalSentrySemanticAttributes.ORIGIN]: 'auto.test.origin',
            [InternalSentrySemanticAttributes.OP]: 'my-op',
            [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
          });

          expect(getSpanMetadata(span)).toEqual({ requestPath: 'test-path' });
        },
      );
    });

    it('allows to pass base SpanOptions', () => {
      const date = Date.now() - 1000;

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
          expect(getSpanAttributes(span)).toEqual({
            [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
            test1: 'test 1',
            test2: 2,
          });
          expect(getSpanKind(span)).toEqual(SpanKind.CLIENT);
        },
      );
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
        [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
      });

      expect(getSpanMetadata(span)).toEqual(undefined);

      const span2 = startInactiveSpan({
        name: 'outer',
        op: 'my-op',
        origin: 'auto.test.origin',
        source: 'task',
        metadata: { requestPath: 'test-path' },
      });

      expect(span2).toBeDefined();
      expect(getSpanAttributes(span2)).toEqual({
        [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
        [InternalSentrySemanticAttributes.SOURCE]: 'task',
        [InternalSentrySemanticAttributes.ORIGIN]: 'auto.test.origin',
        [InternalSentrySemanticAttributes.OP]: 'my-op',
      });

      expect(getSpanMetadata(span2)).toEqual({ requestPath: 'test-path' });
    });

    it('allows to pass base SpanOptions', () => {
      const date = Date.now() - 1000;

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
      expect(getSpanAttributes(span)).toEqual({
        [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
        test1: 'test 1',
        test2: 2,
      });
      expect(getSpanKind(span)).toEqual(SpanKind.CLIENT);
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
      const date = Date.now() - 1000;

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
          expect(getSpanAttributes(span)).toEqual({
            [InternalSentrySemanticAttributes.SAMPLE_RATE]: 1,
            test1: 'test 1',
            test2: 2,
          });
          expect(getSpanKind(span)).toEqual(SpanKind.CLIENT);
        },
      );
    });
  });
});

describe('trace (tracing disabled)', () => {
  beforeEach(() => {
    mockSdkInit({ enableTracing: false });
  });

  afterEach(() => {
    cleanupOtel();
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
  afterEach(() => {
    cleanupOtel();
    jest.clearAllMocks();
  });

  it('samples with a tracesSampleRate, when Math.random() > tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

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
    jest.spyOn(Math, 'random').mockImplementation(() => 0.4);

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
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 1 });

    // This will def. be sampled because of the tracesSampleRate
    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(true);
      expect(getSpanName(outerSpan)).toBe('outer');

      // Now let's mutate the tracesSampleRate so that the next entry _should_ not be sampled
      // but it will because of parent sampling
      const client = getCurrentHub().getClient();
      client!.getOptions().tracesSampleRate = 0.5;

      startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(true);
        expect(getSpanName(innerSpan)).toBe('inner');
      });
    });
  });

  it('negative parent sampling takes precedence over tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 0.5 });

    // This will def. be unsampled because of the tracesSampleRate
    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan.isRecording()).toBe(false);

      // Now let's mutate the tracesSampleRate so that the next entry _should_ be sampled
      // but it will remain unsampled because of parent sampling
      const client = getCurrentHub().getClient();
      client!.getOptions().tracesSampleRate = 1;

      startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan.isRecording()).toBe(false);
      });
    });
  });

  it('positive remote parent sampling takes precedence over tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

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

    const propagationContext: PropagationContext = {
      traceId,
      sampled: true,
      parentSpanId,
      spanId: '6e0c63257de34c93',
    };

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(
      trace.setSpanContext(setPropagationContextOnContext(context.active(), propagationContext), spanContext),
      () => {
        // This will def. be sampled because of the tracesSampleRate
        startSpan({ name: 'outer' }, outerSpan => {
          expect(outerSpan).toBeDefined();
          expect(outerSpan.isRecording()).toBe(true);
          expect(getSpanName(outerSpan)).toBe('outer');
        });
      },
    );
  });

  it('negative remote parent sampling takes precedence over tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

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

    const propagationContext: PropagationContext = {
      traceId,
      sampled: false,
      parentSpanId,
      spanId: '6e0c63257de34c93',
    };

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(
      trace.setSpanContext(setPropagationContextOnContext(context.active(), propagationContext), spanContext),
      () => {
        // This will def. be sampled because of the tracesSampleRate
        startSpan({ name: 'outer' }, outerSpan => {
          expect(outerSpan).toBeDefined();
          expect(outerSpan.isRecording()).toBe(false);
        });
      },
    );
  });

  it('samples with a tracesSampler returning a boolean', () => {
    let tracesSamplerResponse: boolean = true;

    const tracesSampler = jest.fn(() => {
      return tracesSamplerResponse;
    });

    mockSdkInit({ tracesSampler });

    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      transactionContext: { name: 'outer', parentSampled: undefined },
    });

    // Now return `false`, it should not sample
    tracesSamplerResponse = false;

    startSpan({ name: 'outer2' }, outerSpan => {
      expect(outerSpan.isRecording()).toBe(false);

      startSpan({ name: 'inner2' }, innerSpan => {
        expect(innerSpan.isRecording()).toBe(false);
      });
    });

    expect(tracesSampler).toHaveBeenCalledTimes(3);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: false,
      transactionContext: { name: 'inner2', parentSampled: false },
    });
  });

  it('samples with a tracesSampler returning a number', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

    let tracesSamplerResponse: number = 1;

    const tracesSampler = jest.fn(() => {
      return tracesSamplerResponse;
    });

    mockSdkInit({ tracesSampler });

    startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      transactionContext: { name: 'outer', parentSampled: undefined },
    });

    // Now return `0`, it should not sample
    tracesSamplerResponse = 0;

    startSpan({ name: 'outer2' }, outerSpan => {
      expect(outerSpan.isRecording()).toBe(false);

      startSpan({ name: 'inner2' }, innerSpan => {
        expect(innerSpan.isRecording()).toBe(false);
      });
    });

    expect(tracesSampler).toHaveBeenCalledTimes(3);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: false,
      transactionContext: { name: 'inner2', parentSampled: false },
    });

    // Now return `0.4`, it should not sample
    tracesSamplerResponse = 0.4;

    startSpan({ name: 'outer3' }, outerSpan => {
      expect(outerSpan.isRecording()).toBe(false);
    });

    expect(tracesSampler).toHaveBeenCalledTimes(4);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      transactionContext: { name: 'outer3', parentSampled: undefined },
    });
  });

  it('samples with a tracesSampler even if parent is remotely sampled', () => {
    const tracesSampler = jest.fn(() => {
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

    const propagationContext: PropagationContext = {
      traceId,
      sampled: true,
      parentSpanId,
      spanId: '6e0c63257de34c93',
    };

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(
      trace.setSpanContext(setPropagationContextOnContext(context.active(), propagationContext), spanContext),
      () => {
        // This will def. be sampled because of the tracesSampleRate
        startSpan({ name: 'outer' }, outerSpan => {
          expect(outerSpan.isRecording()).toBe(false);
        });
      },
    );

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: true,
      transactionContext: {
        name: 'outer',
        parentSampled: true,
      },
    });
  });
});

function getSpanName(span: AbstractSpan): string | undefined {
  return spanHasName(span) ? span.name : undefined;
}

function getSpanEndTime(span: AbstractSpan): [number, number] | undefined {
  return (span as ReadableSpan).endTime;
}

function getSpanAttributes(span: AbstractSpan): Record<string, unknown> | undefined {
  return spanHasAttributes(span) ? span.attributes : undefined;
}
