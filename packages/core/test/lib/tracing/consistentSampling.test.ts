import { describe, expect, it, vi } from 'vitest';
import {
  captureException,
  getCurrentScope,
  setAsyncContextStrategy,
  setConversationId,
  setCurrentClient,
  startSession,
} from '../../../src';
import { _INTERNAL_captureLog } from '../../../src/logs/internal';
import { _INTERNAL_captureMetric } from '../../../src/metrics/internal';
import { continueTrace, getDynamicSamplingContextFromSpan } from '../../../src/tracing';
import {
  getConsistentSessionSampleRand,
  getFallbackSampleRate,
  sampleRandFromKey,
} from '../../../src/tracing/consistentSampling';
import { startInactiveSpan, startNewTrace, startSpan } from '../../../src/tracing/trace';
import type { CoreOptions } from '../../../src/types/options';
import type { TracesSamplerSamplingContext } from '../../../src/types/samplingcontext';
import type { Session } from '../../../src/types/session';
import type { Span } from '../../../src/types/span';
import { spanIsSampled } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

let client: TestClient;
let capturedLogs: number;
let capturedMetrics: number;

function init(options: Partial<CoreOptions>): TestClient {
  resetGlobals();
  setAsyncContextStrategy(undefined);
  client = new TestClient(getDefaultTestClientOptions({ dsn: 'https://username@domain/123', ...options }));
  setCurrentClient(client);
  client.init();

  capturedLogs = 0;
  capturedMetrics = 0;
  client.on('afterCaptureLog', () => capturedLogs++);
  client.on('afterCaptureMetric', () => capturedMetrics++);
  return client;
}

/** Starts a root span in a new trace, like a browser navigation or a new server request without incoming trace. */
function startRootSpanInNewTrace(name = 'root'): Span {
  return startNewTrace(() => startInactiveSpan({ name }));
}

/** Captures an error inside a new trace and returns whether that trace was sampled. */
function captureErrorInNewTrace(): boolean {
  return startNewTrace(() =>
    startSpan({ name: 'root' }, span => {
      captureException(new Error('boom'));
      return spanIsSampled(span);
    }),
  );
}

/** Starts sessions until one has the wanted decision for the given trace sample rate. */
function startSessionWithDecision(sampled: boolean, sampleRate: number): Session {
  for (;;) {
    const session = startSession();
    if (sampleRandFromKey(session.sid) < sampleRate === sampled) {
      return session;
    }
  }
}

function droppedErrors(): number {
  // @ts-expect-error accessing a protected property for the test
  return client._outcomes['sample_rate:error'] ?? 0;
}

describe('sampleRandFromKey', () => {
  it('is deterministic and returns a value in [0, 1) with at most six decimal places', () => {
    for (const key of ['a', 'conv_1', '7d1b7b8a0e0e4b0d9d7f0d5c0e7c8a11', 'Amélie', '']) {
      const rand = sampleRandFromKey(key);
      expect(rand).toBe(sampleRandFromKey(key));
      expect(rand).toBeGreaterThanOrEqual(0);
      expect(rand).toBeLessThan(1);
      expect(Math.round(rand * 1e6) / 1e6).toBe(rand);
    }
  });

  // These values are the contract with other SDKs: every SDK has to derive the same `sample_rand` from a key.
  it('matches the reference values', () => {
    expect({
      session: sampleRandFromKey('7d1b7b8a0e0e4b0d9d7f0d5c0e7c8a11'),
      conversation: sampleRandFromKey('conv_5j66UpCpwteGg4YSxUnt7lPY'),
      nonAscii: sampleRandFromKey('Amélie'),
    }).toEqual({
      session: 0.857328,
      conversation: 0.09368,
      nonAscii: 0.395654,
    });
  });

  it.each([
    ['sequential keys', (i: number) => `conv_${i}`],
    ['numeric keys', (i: number) => `${i}`],
    ['keys with a common long prefix', (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`],
  ])('spreads %s evenly', (_, makeKey) => {
    const buckets = new Array<number>(10).fill(0);
    const count = 20_000;
    for (let i = 0; i < count; i++) {
      buckets[Math.floor(sampleRandFromKey(makeKey(i)) * 10)]!++;
    }
    for (const bucket of buckets) {
      // 2000 expected per bucket, the standard deviation is ~42
      expect(bucket).toBeGreaterThan(1800);
      expect(bucket).toBeLessThan(2200);
    }
  });
});

describe('getFallbackSampleRate', () => {
  it.each([
    // [sampleRate, traceSampleRate, fallback]
    [0.5, 0.2, 3 / 8],
    [0.5, 0.1, 4 / 9],
    [1, 0.3, 1],
    [0.7, 0, 0.7],
    // The trace rate is the higher one: nothing is left for the fallback
    [0.1, 0.2, 0],
    [0.5, 0.5, 0],
    [1, 1, 0],
  ])('corrects a rate of %s with a trace sample rate of %s to %s', (sampleRate, traceSampleRate, fallback) => {
    expect(getFallbackSampleRate(sampleRate, traceSampleRate)).toBeCloseTo(fallback, 10);
    if (fallback > 0) {
      // The total stays at the rate of the telemetry
      expect(traceSampleRate + (1 - traceSampleRate) * fallback).toBeCloseTo(sampleRate, 10);
    }
  });
});

describe('without consistentSampling', () => {
  it.each([undefined, 'off'] as const)('samples errors with `sampleRate`, independent of their trace (%s)', value => {
    init({ consistentSampling: value, tracesSampleRate: 1, sampleRate: 0 });

    expect(captureErrorInNewTrace()).toBe(true);
    expect(droppedErrors()).toBe(1);
  });
});

describe("consistentSampling: 'trace'", () => {
  it('always sends errors of a sampled trace', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 1, sampleRate: 0 });

    expect(captureErrorInNewTrace()).toBe(true);
    expect(droppedErrors()).toBe(0);
  });

  it('applies `sampleRate` to errors of an unsampled trace', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 0, sampleRate: 0 });
    expect(captureErrorInNewTrace()).toBe(false);
    expect(droppedErrors()).toBe(1);

    init({ consistentSampling: 'trace', tracesSampleRate: 0, sampleRate: 1 });
    expect(captureErrorInNewTrace()).toBe(false);
    expect(droppedErrors()).toBe(0);
  });

  it('applies `sampleRate` to errors outside of a trace', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 1, sampleRate: 0 });

    captureException(new Error('boom'));
    expect(droppedErrors()).toBe(1);
  });

  it('corrects `sampleRate` in unsampled traces, so the SDK sends as many errors as before', () => {
    // 0.5 + (1 - 0.5) * fallback = 0.75 => fallback = 0.5
    init({ consistentSampling: 'trace', tracesSampleRate: 0.5, sampleRate: 0.75 });

    for (let t = 0; t < 2000; t++) {
      const droppedBefore = droppedErrors();
      if (captureErrorInNewTrace()) {
        // Errors of a sampled trace are always sent
        expect(droppedErrors()).toBe(droppedBefore);
      }
    }

    // 25% of all errors are dropped, as with `sampleRate: 0.75` alone. Without the correction it would be 12.5%.
    // 500 expected, the standard deviation is ~19
    expect(droppedErrors()).toBeGreaterThan(400);
    expect(droppedErrors()).toBeLessThan(600);
  });

  it('sends no errors of unsampled traces if `sampleRate` is not above the trace sample rate', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 0.5, sampleRate: 0.3 });

    let unsampledTraces = 0;
    for (let t = 0; t < 200; t++) {
      unsampledTraces += captureErrorInNewTrace() ? 0 : 1;
    }

    expect(droppedErrors()).toBe(unsampledTraces);
  });

  it('uses the decision of the current trace if there is no active span', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 1, sampleRate: 0.5 });
    const trace = { traceId: '12312012123120121231201212312012', sampleRand: 0.9 };

    // Like a page whose navigation span ended: the trace was not sampled, with a rate of 0.5
    getCurrentScope().setPropagationContext({ ...trace, sampled: false, dsc: { sample_rate: '0.5' } });
    for (let i = 0; i < 20; i++) {
      captureException(new Error('boom'));
    }
    expect(droppedErrors()).toBe(20);

    getCurrentScope().setPropagationContext({ ...trace, sampled: true, dsc: { sample_rate: '0.5' } });
    captureException(new Error('boom'));
    expect(droppedErrors()).toBe(20);
  });

  it('samples each trace on its own', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 0.5 });
    startSession();

    const rands = new Set<string | undefined>();
    for (let t = 0; t < 5; t++) {
      rands.add(getDynamicSamplingContextFromSpan(startRootSpanInNewTrace()).sample_rand);
    }
    expect(rands.size).toBe(5);
  });

  it('sends logs and metrics of sampled and unsampled traces, because they have no sample rate of their own', () => {
    init({ consistentSampling: 'trace', tracesSampleRate: 0 });

    startNewTrace(() =>
      startSpan({ name: 'root' }, () => {
        _INTERNAL_captureLog({ level: 'info', message: 'hello' }, getCurrentScope());
        _INTERNAL_captureMetric({ type: 'counter', name: 'clicks', value: 1 });
      }),
    );

    expect(capturedLogs).toBe(1);
    expect(capturedMetrics).toBe(1);
  });
});

describe("consistentSampling: 'session'", () => {
  it('gives all traces of a session the decision of its first trace', () => {
    init({ consistentSampling: 'session', tracesSampleRate: 0.5 });

    const decisions = new Set<boolean>();
    for (let s = 0; s < 50; s++) {
      const session = startSession();
      const first = startRootSpanInNewTrace();
      const firstDsc = getDynamicSamplingContextFromSpan(first);
      decisions.add(spanIsSampled(first));

      // The SDK is head of the first trace, so the session's value is derived from its id
      expect(firstDsc.sample_rand).toBe(`${sampleRandFromKey(session.sid)}`);

      for (let t = 0; t < 4; t++) {
        const span = startRootSpanInNewTrace();
        const dsc = getDynamicSamplingContextFromSpan(span);

        expect(spanIsSampled(span)).toBe(spanIsSampled(first));
        // Later traces report the value and rate of the first trace, so the DSC invariant holds and Sentry
        // extrapolates correctly: sample_rand < sample_rate <=> sampled
        expect(dsc.sample_rand).toBe(firstDsc.sample_rand);
        expect(dsc.sample_rate).toBe('0.5');
        expect(Number(dsc.sample_rand) < Number(dsc.sample_rate)).toBe(dsc.sampled === 'true');
      }
    }

    // A new session is sampled again
    expect(decisions).toEqual(new Set([true, false]));
  });

  it('samples about `tracesSampleRate` of all sessions', () => {
    init({ consistentSampling: 'session', tracesSampleRate: 0.25 });

    let sampledSessions = 0;
    for (let s = 0; s < 2000; s++) {
      startSession();
      if (spanIsSampled(startRootSpanInNewTrace())) {
        sampledSessions++;
      }
    }
    expect(sampledSessions).toBeGreaterThan(430);
    expect(sampledSessions).toBeLessThan(570);
  });

  it('sends all errors of a sampled session and applies `sampleRate` in an unsampled one', () => {
    init({ consistentSampling: 'session', tracesSampleRate: 0.5, sampleRate: 0 });

    startSessionWithDecision(true, 0.5);
    for (let t = 0; t < 3; t++) {
      expect(captureErrorInNewTrace()).toBe(true);
    }
    expect(droppedErrors()).toBe(0);

    startSessionWithDecision(false, 0.5);
    for (let t = 0; t < 3; t++) {
      expect(captureErrorInNewTrace()).toBe(false);
    }
    expect(droppedErrors()).toBe(3);
  });

  it('samples each trace on its own while there is no session', () => {
    init({ consistentSampling: 'session', tracesSampleRate: 0.5 });

    const rands = new Set<string | undefined>();
    for (let t = 0; t < 5; t++) {
      rands.add(getDynamicSamplingContextFromSpan(startRootSpanInNewTrace()).sample_rand);
    }
    expect(rands.size).toBe(5);
  });

  describe('with a tracesSampler', () => {
    it('passes the session decision to the sampler as the parent decision', () => {
      const tracesSampler = vi.fn(({ inheritOrSampleWith }: TracesSamplerSamplingContext) => inheritOrSampleWith(0.5));
      init({ consistentSampling: 'session', tracesSampler });
      startSessionWithDecision(true, 0.5);

      startRootSpanInNewTrace('first');
      expect(tracesSampler).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'first', parentSampled: undefined, parentSampleRate: undefined }),
      );

      const later = startRootSpanInNewTrace('later');
      expect(tracesSampler).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'later', parentSampled: true, parentSampleRate: 0.5 }),
      );
      expect(spanIsSampled(later)).toBe(true);
    });

    it('keeps traces consistent for a sampler that ignores the parent decision but returns one rate', () => {
      init({ consistentSampling: 'session', tracesSampler: () => 0.5 });

      for (let s = 0; s < 50; s++) {
        const session = startSession();
        const expected = sampleRandFromKey(session.sid) < 0.5;
        for (let t = 0; t < 3; t++) {
          expect(spanIsSampled(startRootSpanInNewTrace())).toBe(expected);
        }
      }
    });

    it('lets the sampler deviate for a single trace without changing the session decision', () => {
      init({
        consistentSampling: 'session',
        tracesSampler: ({ name, inheritOrSampleWith }) => (name === 'checkout' ? 1 : inheritOrSampleWith(0.5)),
      });
      startSessionWithDecision(false, 0.5);

      expect(spanIsSampled(startRootSpanInNewTrace('browse'))).toBe(false);
      expect(spanIsSampled(startRootSpanInNewTrace('checkout'))).toBe(true);
      expect(spanIsSampled(startRootSpanInNewTrace('browse'))).toBe(false);
    });
  });

  describe('with a first trace continued from another service', () => {
    const incoming = (sampleRand: number, sampled: boolean) => ({
      sentryTrace: `12312012123120121231201212312012-1121201211212012-${sampled ? 1 : 0}`,
      baggage: `sentry-sample_rand=${sampleRand},sentry-sample_rate=0.5,sentry-sampled=${sampled}`,
    });

    it('takes over a positive decision, whatever the own trace sample rate is', () => {
      init({ consistentSampling: 'session', tracesSampleRate: 0 });
      startSession();

      // A server-rendered pageload: the server sampled the trace with its rate of 0.5
      const pageload = continueTrace(incoming(0.3, true), () => startInactiveSpan({ name: 'pageload' }));
      expect(spanIsSampled(pageload)).toBe(true);

      const navigation = startRootSpanInNewTrace('navigation');
      const dsc = getDynamicSamplingContextFromSpan(navigation);
      expect(spanIsSampled(navigation)).toBe(true);
      expect(dsc.sample_rand).toBe('0.3');
      expect(dsc.sample_rate).toBe('0.5');
      expect(getConsistentSessionSampleRand(client.getOptions())).toBe(0.3);
    });

    it('takes over a negative decision, whatever the own trace sample rate is', () => {
      init({ consistentSampling: 'session', tracesSampleRate: 1 });
      startSession();

      const pageload = continueTrace(incoming(0.7, false), () => startInactiveSpan({ name: 'pageload' }));
      expect(spanIsSampled(pageload)).toBe(false);

      const navigation = startRootSpanInNewTrace('navigation');
      const dsc = getDynamicSamplingContextFromSpan(navigation);
      expect(spanIsSampled(navigation)).toBe(false);
      expect(dsc.sample_rand).toBe('0.7');
      expect(dsc.sample_rate).toBe('0.5');
    });

    it('keeps its decision if a later trace is continued from another service', () => {
      init({ consistentSampling: 'session', tracesSampleRate: 0.5 });
      startSessionWithDecision(true, 0.5);
      startRootSpanInNewTrace();

      // The other service decides for its own trace
      const continued = continueTrace(incoming(0.99, false), () => startInactiveSpan({ name: 'pageload' }));
      expect(spanIsSampled(continued)).toBe(false);

      expect(spanIsSampled(startRootSpanInNewTrace())).toBe(true);
    });
  });
});

describe("consistentSampling: 'conversation'", () => {
  it('makes the same decision for a conversation in every process, without shared state', () => {
    const decisions = new Set<boolean>();

    for (let c = 0; c < 50; c++) {
      const conversationId = `conv_${c}`;
      const expectedSampled = sampleRandFromKey(conversationId) < 0.5;
      decisions.add(expectedSampled);

      // Each turn of the conversation is a separate request, possibly in a separate process
      for (let turn = 0; turn < 3; turn++) {
        init({ consistentSampling: 'conversation', tracesSampleRate: 0.5, sampleRate: 0 });
        setConversationId(conversationId);

        expect(captureErrorInNewTrace()).toBe(expectedSampled);
        expect(droppedErrors()).toBe(expectedSampled ? 0 : 1);
      }
    }

    expect(decisions).toEqual(new Set([true, false]));
  });

  it('samples each trace on its own while there is no conversation', () => {
    init({ consistentSampling: 'conversation', tracesSampleRate: 0.5 });

    const rands = new Set<string | undefined>();
    for (let t = 0; t < 5; t++) {
      rands.add(getDynamicSamplingContextFromSpan(startRootSpanInNewTrace()).sample_rand);
    }
    expect(rands.size).toBe(5);
  });

  it('cannot change a trace that started before the conversation id was set', () => {
    init({ consistentSampling: 'conversation', tracesSampleRate: 1 });

    startNewTrace(() => {
      // Like an `http.server` span that starts before the request handler knows the conversation
      const span = startInactiveSpan({ name: 'POST /chat' });
      const sampleRand = getDynamicSamplingContextFromSpan(span).sample_rand;

      setConversationId('conv_late');

      expect(getDynamicSamplingContextFromSpan(span).sample_rand).toBe(sampleRand);
      expect(sampleRand).not.toBe(`${sampleRandFromKey('conv_late')}`);
    });
  });
});
