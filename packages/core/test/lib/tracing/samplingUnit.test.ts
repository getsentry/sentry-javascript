import { SENTRY_CLIENT_SAMPLE_RATE } from '@sentry/conventions/attributes';
import { describe, expect, it, vi } from 'vitest';
import {
  captureException,
  getIsolationScope,
  hasSpansEnabled,
  setAsyncContextStrategy,
  setConversationId,
  setCurrentClient,
  startSession,
} from '../../../src';
import { _INTERNAL_captureLog } from '../../../src/logs/internal';
import { _INTERNAL_captureMetric } from '../../../src/metrics/internal';
import { continueTrace, getDynamicSamplingContextFromSpan } from '../../../src/tracing';
import { getFallbackSampleRate, resolveSamplingUnit, sampleRandFromKey } from '../../../src/tracing/samplingUnit';
import { startInactiveSpan, startNewTrace } from '../../../src/tracing/trace';
import type { CoreOptions } from '../../../src/types/options';
import type { RequestEventData } from '../../../src/types/request';
import type { Session } from '../../../src/types/session';
import type { Span } from '../../../src/types/span';
import { spanIsSampled } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

let client: TestClient;
let logs: unknown[];
let metrics: unknown[];

function init(options: Partial<CoreOptions>): TestClient {
  resetGlobals();
  setAsyncContextStrategy(undefined);
  client = new TestClient(getDefaultTestClientOptions({ dsn: 'https://username@domain/123', ...options }));
  setCurrentClient(client);
  client.init();

  // The log and metric buffers flush once they are full, so we collect captured items through the client hooks.
  // We record the `sentry.client_sample_rate` attribute of each item, which stays unset: they are not sampled.
  logs = [];
  metrics = [];
  client.on('afterCaptureLog', log => logs.push(log.attributes?.[SENTRY_CLIENT_SAMPLE_RATE]));
  client.on('afterCaptureMetric', metric => metrics.push(metric.attributes?.[SENTRY_CLIENT_SAMPLE_RATE]));
  return client;
}

/** Starts a root span in a new trace, like a browser navigation or a new server request without incoming trace. */
function startRootSpanInNewTrace(name = 'root'): Span {
  return startNewTrace(() => startInactiveSpan({ name }));
}

/** Starts sessions until one has the wanted decision for the given rate. */
function startSessionWithDecision(sampled: boolean, sampleRate: number): Session {
  for (;;) {
    const session = startSession();
    if (sampleRandFromKey(session.sid) < sampleRate === sampled) {
      return session;
    }
  }
}

function captureOneOfEach(): void {
  _INTERNAL_captureLog({ level: 'info', message: 'hello' });
  _INTERNAL_captureMetric({ type: 'counter', name: 'clicks', value: 1 });
  captureException(new Error('boom'));
}

function outcomes(): Record<string, number> {
  // @ts-expect-error accessing a protected property for the test
  return client._outcomes;
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
    // [sampleRate, unitRate, fallback]
    [0.2, 0.1, 1 / 9],
    [0.5, 0.1, 4 / 9],
    [1, 0.3, 1],
    [0.7, 0, 0.7],
    // The unit rate is the higher one: nothing is left for the fallback
    [0.1, 0.2, 0],
    [0.5, 0.5, 0],
    [1, 1, 0],
  ])('corrects a rate of %s with a unit rate of %s to %s', (sampleRate, unitRate, fallback) => {
    expect(getFallbackSampleRate(sampleRate, unitRate)).toBeCloseTo(fallback, 10);
    if (fallback > 0) {
      // The total stays at the rate of the telemetry
      expect(unitRate + (1 - unitRate) * fallback).toBeCloseTo(sampleRate, 10);
    }
  });
});

describe('sessionSampleRate', () => {
  it('turns span recording on without `tracesSampleRate`', () => {
    init({ sessionSampleRate: 0.5 });
    expect(hasSpansEnabled()).toBe(true);
  });

  it('makes one decision per session for all of its traces', () => {
    init({ sessionSampleRate: 0.5 });

    for (let s = 0; s < 50; s++) {
      const session = startSession();
      const expectedRand = sampleRandFromKey(session.sid);

      for (let t = 0; t < 5; t++) {
        const span = startRootSpanInNewTrace();
        const dsc = getDynamicSamplingContextFromSpan(span);

        // There is no `tracesSampleRate` to fall back to, so only sampled sessions send spans
        expect(spanIsSampled(span)).toBe(expectedRand < 0.5);
        // The trace reports the session rate, and the DSC invariant holds: sample_rand < sample_rate <=> sampled
        expect(dsc.sample_rate).toBe('0.5');
        expect(dsc.sampled).toBe(`${expectedRand < 0.5}`);
        if (expectedRand < 0.5) {
          // All traces of a sampled session carry the session's value
          expect(dsc.sample_rand).toBe(`${expectedRand}`);
        } else {
          expect(Number(dsc.sample_rand)).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });

  it('samples about `sessionSampleRate` of all sessions', () => {
    init({ sessionSampleRate: 0.25 });

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

  it('sends all spans, errors, logs and metrics of a sampled session', () => {
    // `tracesSampler` and `sampleRate` would drop everything. A sampled session is sent anyway.
    const tracesSampler = vi.fn(() => 0);
    init({ sessionSampleRate: 0.5, tracesSampler, sampleRate: 0 });
    startSessionWithDecision(true, 0.5);

    for (let i = 0; i < 3; i++) {
      const span = startRootSpanInNewTrace();
      expect(spanIsSampled(span)).toBe(true);
      // The session rate is the higher one, so the spans report it
      expect(getDynamicSamplingContextFromSpan(span).sample_rate).toBe('0.5');
      captureOneOfEach();
    }

    // Logs and metrics are not sampled, so they carry no sample rate
    expect(logs).toEqual([undefined, undefined, undefined]);
    expect(metrics).toEqual([undefined, undefined, undefined]);
    expect(outcomes()).toEqual({});
  });

  describe('in an unsampled session', () => {
    it('falls back to `tracesSampler`, and sends logs and metrics as before', () => {
      init({ sessionSampleRate: 0.5, tracesSampler: () => 1 });
      startSessionWithDecision(false, 0.5);

      for (let i = 0; i < 3; i++) {
        const span = startRootSpanInNewTrace();
        expect(spanIsSampled(span)).toBe(true);
        expect(getDynamicSamplingContextFromSpan(span).sample_rate).toBe('1');
        captureOneOfEach();
      }

      // Logs and metrics are not sampled, so the session's decision does not apply to them
      expect(logs).toEqual([undefined, undefined, undefined]);
      expect(metrics).toEqual([undefined, undefined, undefined]);
      // Errors are sent: `sampleRate` defaults to 1
      expect(outcomes()).toEqual({});
    });

    it('sends no spans if the session rate is not below `tracesSampleRate`, and reports the session rate', () => {
      init({ sessionSampleRate: 0.5, tracesSampleRate: 0.2 });
      startSessionWithDecision(false, 0.5);

      for (let i = 0; i < 20; i++) {
        const span = startRootSpanInNewTrace();
        const dsc = getDynamicSamplingContextFromSpan(span);
        expect(spanIsSampled(span)).toBe(false);
        expect(dsc.sample_rate).toBe('0.5');
        expect(Number(dsc.sample_rand)).toBeGreaterThanOrEqual(0.5);
      }
      expect(outcomes()).toEqual({ 'sample_rate:transaction': 20, 'sample_rate:span': 20 });
    });

    it('applies the corrected `sampleRate` to errors', () => {
      // 0.5 + (1 - 0.5) * fallback = 0.75 => fallback = 0.5
      init({ sessionSampleRate: 0.5, sampleRate: 0.75 });
      startSessionWithDecision(false, 0.5);

      for (let i = 0; i < 2000; i++) {
        captureException(new Error('boom'));
      }

      // 1000 expected, the standard deviation is ~22
      expect(outcomes()['sample_rate:error']).toBeGreaterThan(880);
      expect(outcomes()['sample_rate:error']).toBeLessThan(1120);
    });

    it('sends no errors if the session rate is not below `sampleRate`', () => {
      init({ sessionSampleRate: 0.5, sampleRate: 0.5 });
      startSessionWithDecision(false, 0.5);

      for (let i = 0; i < 20; i++) {
        captureException(new Error('boom'));
      }

      expect(outcomes()['sample_rate:error']).toBe(20);
    });
  });

  it('sends as many spans as `tracesSampleRate` alone, and every span reports `tracesSampleRate`', () => {
    init({ sessionSampleRate: 0.1, tracesSampleRate: 0.2 });

    let traces = 0;
    let sent = 0;
    let sentInSampledSessions = 0;
    for (let s = 0; s < 4000; s++) {
      const session = startSession();
      const sessionSampled = sampleRandFromKey(session.sid) < 0.1;

      for (let t = 0; t < 3; t++) {
        const span = startRootSpanInNewTrace();
        const dsc = getDynamicSamplingContextFromSpan(span);
        traces++;

        // Every span has the same overall chance to be sent, so every span reports the same rate
        expect(dsc.sample_rate).toBe('0.2');
        expect(Number(dsc.sample_rand) < 0.2).toBe(spanIsSampled(span));

        if (sessionSampled) {
          expect(spanIsSampled(span)).toBe(true);
          sentInSampledSessions++;
        }
        if (spanIsSampled(span)) {
          sent++;
        }
      }
    }

    // 10% of all spans are sent in sampled sessions, another 10% as a fallback with a rate of 0.111.
    // Without the correction, 28% would be sent.
    expect(sentInSampledSessions / traces).toBeGreaterThan(0.07);
    expect(sentInSampledSessions / traces).toBeLessThan(0.13);
    expect(sent / traces).toBeGreaterThan(0.17);
    expect(sent / traces).toBeLessThan(0.23);
  });

  it('leaves telemetry outside of a session to the existing options', () => {
    init({ sessionSampleRate: 0, tracesSampleRate: 1 });

    // No session was started
    expect(spanIsSampled(startRootSpanInNewTrace())).toBe(true);
    captureOneOfEach();

    // Logs and metrics have no rate of their own, so they are sent and carry no sample rate
    expect(logs).toEqual([undefined]);
    expect(metrics).toEqual([undefined]);
    expect(outcomes()).toEqual({});
  });

  it('does not sample traces outside of a session if there is no trace rate', () => {
    init({ sessionSampleRate: 1 });
    expect(spanIsSampled(startRootSpanInNewTrace())).toBe(false);
    expect(outcomes()).toEqual({ 'sample_rate:transaction': 1, 'sample_rate:span': 1 });
  });

  describe('with a trace continued from another service', () => {
    const incoming = (sampleRand: number, sampled: boolean) => ({
      sentryTrace: `12312012123120121231201212312012-1121201211212012-${sampled ? 1 : 0}`,
      baggage: `sentry-sample_rand=${sampleRand},sentry-sample_rate=1,sentry-sampled=${sampled}`,
    });

    it('keeps the decision of the trace head and lets a new session adopt its sample_rand', () => {
      init({ sessionSampleRate: 0.5 });
      startSession();

      // The other service sampled this trace with a value that the session rate rejects
      const continued = continueTrace(incoming(0.9, true), () => startInactiveSpan({ name: 'pageload' }));
      expect(spanIsSampled(continued)).toBe(true);

      // The session adopted 0.9, so it is unsampled: later traces are dropped
      expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ sampleRand: 0.9, sampled: false });
      expect(spanIsSampled(startRootSpanInNewTrace('navigation'))).toBe(false);
    });

    it('agrees with the trace head if both use the same rate', () => {
      init({ sessionSampleRate: 0.5 });

      for (const sampleRand of [0.1, 0.3, 0.6, 0.8]) {
        startSession();
        // A head that samples with rate 0.5 as well
        const continued = continueTrace(incoming(sampleRand, sampleRand < 0.5), () =>
          startInactiveSpan({ name: 'pageload' }),
        );
        const navigation = startRootSpanInNewTrace('navigation');

        expect(spanIsSampled(navigation)).toBe(spanIsSampled(continued));
        if (sampleRand < 0.5) {
          expect(getDynamicSamplingContextFromSpan(navigation).sample_rand).toBe(`${sampleRand}`);
        }
      }
    });

    it('does not change a session that already has its value', () => {
      init({ sessionSampleRate: 0.5 });
      const session = startSessionWithDecision(true, 0.5);
      startRootSpanInNewTrace();

      const continued = continueTrace(incoming(0.99, false), () => startInactiveSpan({ name: 'pageload' }));

      // The trace keeps the negative decision of its head, the session stays sampled
      expect(spanIsSampled(continued)).toBe(false);
      expect(resolveSamplingUnit(client.getOptions())).toMatchObject({
        sampleRand: sampleRandFromKey(session.sid),
        sampled: true,
      });
      expect(spanIsSampled(startRootSpanInNewTrace())).toBe(true);
    });
  });
});

describe('conversationSampleRate', () => {
  it('makes the same decision for a conversation in every process, without shared state', () => {
    for (let c = 0; c < 50; c++) {
      const conversationId = `conv_${c}`;
      const expectedSampled = sampleRandFromKey(conversationId) < 0.5;

      // Each turn of the conversation is a separate request, possibly in a separate process
      for (let turn = 0; turn < 3; turn++) {
        init({ conversationSampleRate: 0.5 });
        setConversationId(conversationId);

        expect(spanIsSampled(startRootSpanInNewTrace('POST /chat'))).toBe(expectedSampled);
      }
    }
  });

  it('cannot change a trace that started before the conversation id was set', () => {
    init({ conversationSampleRate: 0, tracesSampleRate: 1 });

    startNewTrace(() => {
      // Like an `http.server` span that starts before the request handler knows the conversation
      const span = startInactiveSpan({ name: 'POST /chat' });
      expect(spanIsSampled(span)).toBe(true);

      setConversationId('conv_late');

      // The trace keeps its decision
      expect(spanIsSampled(span)).toBe(true);
    });
  });
});

describe('provideConversationId', () => {
  it('provides the conversation of an incoming request before its trace is sampled', () => {
    const provideConversationId = vi.fn((request: RequestEventData) => request.headers?.['x-conv-id']);
    init({ conversationSampleRate: 0.5, provideConversationId });

    // No request yet: there is no conversation
    expect(resolveSamplingUnit(client.getOptions())).toBeUndefined();
    expect(provideConversationId).not.toHaveBeenCalled();

    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest: { headers: { 'x-conv-id': 'conv_header' } } });

    const span = startRootSpanInNewTrace('POST /chat');
    expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ type: 'conversation', key: 'conv_header' });
    expect(spanIsSampled(span)).toBe(sampleRandFromKey('conv_header') < 0.5);

    // A conversation id that was set explicitly wins
    setConversationId('conv_explicit');
    expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ key: 'conv_explicit' });
  });

  it('falls back to the existing options if the callback throws', () => {
    init({
      conversationSampleRate: 0,
      tracesSampleRate: 1,
      provideConversationId: () => {
        throw new Error('nope');
      },
    });
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest: { headers: {} } });

    expect(spanIsSampled(startRootSpanInNewTrace())).toBe(true);
  });
});

describe('sessionSampleRate with conversationSampleRate', () => {
  it('prefers the session if both are available', () => {
    init({ sessionSampleRate: 1, conversationSampleRate: 0 });
    setConversationId('conv_1');
    expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ type: 'conversation', sampled: false });

    startSession();
    expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ type: 'session', sampled: true });
  });
});
