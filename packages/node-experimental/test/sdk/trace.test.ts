import { context, trace, TraceFlags } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/sdk-trace-base';
import type { PropagationContext } from '@sentry/types';

import * as Sentry from '../../src';
import {
  OTEL_ATTR_OP,
  OTEL_ATTR_ORIGIN,
  OTEL_ATTR_SENTRY_SAMPLE_RATE,
  OTEL_ATTR_SOURCE,
  SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY,
} from '../../src/constants';
import { getSpanMetadata } from '../../src/opentelemetry/spanData';
import { getActiveSpan } from '../../src/utils/getActiveSpan';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

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

      const res = Sentry.startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans.push(outerSpan!);

        expect(outerSpan?.name).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        Sentry.startSpan({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans.push(innerSpan!);

          expect(innerSpan?.name).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });

        return 'test value';
      });

      expect(res).toEqual('test value');

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans).toHaveLength(2);
      const [outerSpan, innerSpan] = spans;

      expect(outerSpan.name).toEqual('outer');
      expect(innerSpan.name).toEqual('inner');

      expect(outerSpan.endTime).not.toEqual([0, 0]);
      expect(innerSpan.endTime).not.toEqual([0, 0]);
    });

    it('works with an async callback', async () => {
      const spans: Span[] = [];

      expect(getActiveSpan()).toEqual(undefined);

      const res = await Sentry.startSpan({ name: 'outer' }, async outerSpan => {
        expect(outerSpan).toBeDefined();
        spans.push(outerSpan!);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(outerSpan?.name).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        await Sentry.startSpan({ name: 'inner' }, async innerSpan => {
          expect(innerSpan).toBeDefined();
          spans.push(innerSpan!);

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(innerSpan?.name).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });

        return 'test value';
      });

      expect(res).toEqual('test value');

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans).toHaveLength(2);
      const [outerSpan, innerSpan] = spans;

      expect(outerSpan.name).toEqual('outer');
      expect(innerSpan.name).toEqual('inner');

      expect(outerSpan.endTime).not.toEqual([0, 0]);
      expect(innerSpan.endTime).not.toEqual([0, 0]);
    });

    it('works with multiple parallel calls', () => {
      const spans1: Span[] = [];
      const spans2: Span[] = [];

      expect(getActiveSpan()).toEqual(undefined);

      Sentry.startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans1.push(outerSpan!);

        expect(outerSpan?.name).toEqual('outer');
        expect(getActiveSpan()).toEqual(outerSpan);

        Sentry.startSpan({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans1.push(innerSpan!);

          expect(innerSpan?.name).toEqual('inner');
          expect(getActiveSpan()).toEqual(innerSpan);
        });
      });

      Sentry.startSpan({ name: 'outer2' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans2.push(outerSpan!);

        expect(outerSpan?.name).toEqual('outer2');
        expect(getActiveSpan()).toEqual(outerSpan);

        Sentry.startSpan({ name: 'inner2' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans2.push(innerSpan!);

          expect(innerSpan?.name).toEqual('inner2');
          expect(getActiveSpan()).toEqual(innerSpan);
        });
      });

      expect(getActiveSpan()).toEqual(undefined);
      expect(spans1).toHaveLength(2);
      expect(spans2).toHaveLength(2);
    });

    it('allows to pass context arguments', () => {
      Sentry.startSpan(
        {
          name: 'outer',
        },
        span => {
          expect(span).toBeDefined();
          expect(span?.attributes).toEqual({
            [OTEL_ATTR_SENTRY_SAMPLE_RATE]: 1,
          });

          expect(getSpanMetadata(span!)).toEqual(undefined);
        },
      );

      Sentry.startSpan(
        {
          name: 'outer',
          op: 'my-op',
          origin: 'auto.test.origin',
          source: 'task',
          metadata: { requestPath: 'test-path' },
        },
        span => {
          expect(span).toBeDefined();
          expect(span?.attributes).toEqual({
            [OTEL_ATTR_SOURCE]: 'task',
            [OTEL_ATTR_ORIGIN]: 'auto.test.origin',
            [OTEL_ATTR_OP]: 'my-op',
            [OTEL_ATTR_SENTRY_SAMPLE_RATE]: 1,
          });

          expect(getSpanMetadata(span!)).toEqual({ requestPath: 'test-path' });
        },
      );
    });
  });

  describe('startInactiveSpan', () => {
    it('works at the root', () => {
      const span = Sentry.startInactiveSpan({ name: 'test' });

      expect(span).toBeDefined();
      expect(span?.name).toEqual('test');
      expect(span?.endTime).toEqual([0, 0]);
      expect(getActiveSpan()).toBeUndefined();

      span?.end();

      expect(span?.endTime).not.toEqual([0, 0]);
      expect(getActiveSpan()).toBeUndefined();
    });

    it('works as a child span', () => {
      Sentry.startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        expect(getActiveSpan()).toEqual(outerSpan);

        const innerSpan = Sentry.startInactiveSpan({ name: 'test' });

        expect(innerSpan).toBeDefined();
        expect(innerSpan?.name).toEqual('test');
        expect(innerSpan?.endTime).toEqual([0, 0]);
        expect(getActiveSpan()).toEqual(outerSpan);

        innerSpan?.end();

        expect(innerSpan?.endTime).not.toEqual([0, 0]);
        expect(getActiveSpan()).toEqual(outerSpan);
      });
    });

    it('allows to pass context arguments', () => {
      const span = Sentry.startInactiveSpan({
        name: 'outer',
      });

      expect(span).toBeDefined();
      expect(span?.attributes).toEqual({
        [OTEL_ATTR_SENTRY_SAMPLE_RATE]: 1,
      });

      expect(getSpanMetadata(span!)).toEqual(undefined);

      const span2 = Sentry.startInactiveSpan({
        name: 'outer',
        op: 'my-op',
        origin: 'auto.test.origin',
        source: 'task',
        metadata: { requestPath: 'test-path' },
      });

      expect(span2).toBeDefined();
      expect(span2?.attributes).toEqual({
        [OTEL_ATTR_SENTRY_SAMPLE_RATE]: 1,
        [OTEL_ATTR_SOURCE]: 'task',
        [OTEL_ATTR_ORIGIN]: 'auto.test.origin',
        [OTEL_ATTR_OP]: 'my-op',
      });

      expect(getSpanMetadata(span2!)).toEqual({ requestPath: 'test-path' });
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
    const val = Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeUndefined();

      return 'test value';
    });

    expect(val).toEqual('test value');
  });

  it('startInactiveSpan returns undefined', () => {
    const span = Sentry.startInactiveSpan({ name: 'test' });

    expect(span).toBeUndefined();
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

    Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeUndefined();

      Sentry.startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeUndefined();
      });
    });
  });

  it('samples with a tracesSampleRate, when Math.random() < tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.4);

    mockSdkInit({ tracesSampleRate: 0.5 });

    Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan?.isRecording()).toBe(true);
      // All fields are empty for NonRecordingSpan
      expect(outerSpan?.name).toBe('outer');

      Sentry.startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan?.isRecording()).toBe(true);
        expect(innerSpan?.name).toBe('inner');
      });
    });
  });

  it('positive parent sampling takes precedence over tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 1 });

    // This will def. be sampled because of the tracesSampleRate
    Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
      expect(outerSpan?.isRecording()).toBe(true);
      expect(outerSpan?.name).toBe('outer');

      // Now let's mutate the tracesSampleRate so that the next entry _should_ not be sampled
      // but it will because of parent sampling
      const client = Sentry.getCurrentHub().getClient();
      client!.getOptions().tracesSampleRate = 0.5;

      Sentry.startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeDefined();
        expect(innerSpan?.isRecording()).toBe(true);
        expect(innerSpan?.name).toBe('inner');
      });
    });
  });

  it('negative parent sampling takes precedence over tracesSampleRate', () => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0.6);

    mockSdkInit({ tracesSampleRate: 0.5 });

    // This will def. be sampled because of the tracesSampleRate
    Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeUndefined();

      // Now let's mutate the tracesSampleRate so that the next entry _should_ not be sampled
      // but it will because of parent sampling
      const client = Sentry.getCurrentHub().getClient();
      client!.getOptions().tracesSampleRate = 1;

      Sentry.startSpan({ name: 'inner' }, innerSpan => {
        expect(innerSpan).toBeUndefined();
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
      trace.setSpanContext(
        context.active().setValue(SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY, propagationContext),
        spanContext,
      ),
      () => {
        // This will def. be sampled because of the tracesSampleRate
        Sentry.startSpan({ name: 'outer' }, outerSpan => {
          expect(outerSpan).toBeDefined();
          expect(outerSpan?.isRecording()).toBe(true);
          expect(outerSpan?.name).toBe('outer');
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
      trace.setSpanContext(
        context.active().setValue(SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY, propagationContext),
        spanContext,
      ),
      () => {
        // This will def. be sampled because of the tracesSampleRate
        Sentry.startSpan({ name: 'outer' }, outerSpan => {
          expect(outerSpan).toBeUndefined();
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

    Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      transactionContext: { name: 'outer', parentSampled: undefined },
    });

    // Now return `false`, it should not sample
    tracesSamplerResponse = false;

    Sentry.startSpan({ name: 'outer2' }, outerSpan => {
      expect(outerSpan).toBeUndefined();

      Sentry.startSpan({ name: 'inner2' }, outerSpan => {
        expect(outerSpan).toBeUndefined();
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

    Sentry.startSpan({ name: 'outer' }, outerSpan => {
      expect(outerSpan).toBeDefined();
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      transactionContext: { name: 'outer', parentSampled: undefined },
    });

    // Now return `0`, it should not sample
    tracesSamplerResponse = 0;

    Sentry.startSpan({ name: 'outer2' }, outerSpan => {
      expect(outerSpan).toBeUndefined();

      Sentry.startSpan({ name: 'inner2' }, outerSpan => {
        expect(outerSpan).toBeUndefined();
      });
    });

    expect(tracesSampler).toHaveBeenCalledTimes(3);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: false,
      transactionContext: { name: 'inner2', parentSampled: false },
    });

    // Now return `0.4`, it should not sample
    tracesSamplerResponse = 0.4;

    Sentry.startSpan({ name: 'outer3' }, outerSpan => {
      expect(outerSpan).toBeUndefined();
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
      trace.setSpanContext(
        context.active().setValue(SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY, propagationContext),
        spanContext,
      ),
      () => {
        // This will def. be sampled because of the tracesSampleRate
        Sentry.startSpan({ name: 'outer' }, outerSpan => {
          expect(outerSpan).toBeUndefined();
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
