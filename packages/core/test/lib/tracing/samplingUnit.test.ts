import { SENTRY_CLIENT_SAMPLE_RATE } from '@sentry/conventions/attributes';
import { describe, expect, it, vi } from 'vitest';
import {
  captureException,
  getCurrentScope,
  hasSpansEnabled,
  setAsyncContextStrategy,
  setConversationId,
  setCurrentClient,
  startSession,
} from '../../../src';
import { _INTERNAL_captureLog } from '../../../src/logs/internal';
import { _INTERNAL_captureMetric } from '../../../src/metrics/internal';
import { continueTrace, getDynamicSamplingContextFromSpan } from '../../../src/tracing';
import { resolveSamplingUnit, sampleRandFromKey } from '../../../src/tracing/samplingUnit';
import { startInactiveSpan, startNewTrace } from '../../../src/tracing/trace';
import type { CoreOptions } from '../../../src/types/options';
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
  // We record the `sentry.client_sample_rate` attribute of each item.
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

        expect(spanIsSampled(span)).toBe(expectedRand < 0.5);
        // The trace carries the session's value and rate, so the DSC invariant holds and Sentry extrapolates
        // with the session rate: sample_rand < sample_rate <=> sampled
        expect(dsc.sample_rand).toBe(`${expectedRand}`);
        expect(dsc.sample_rate).toBe('0.5');
        expect(dsc.sampled).toBe(`${expectedRand < 0.5}`);
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

  it('sends all telemetry of a sampled session', () => {
    // `tracesSampler` and `sampleRate` would drop everything. Inside a sampled session they are not consulted.
    const tracesSampler = vi.fn(() => 0);
    init({ sessionSampleRate: 0.5, tracesSampler, sampleRate: 0 });
    startSessionWithDecision(true, 0.5);

    for (let i = 0; i < 3; i++) {
      expect(spanIsSampled(startRootSpanInNewTrace())).toBe(true);
      captureOneOfEach();
    }

    expect(tracesSampler).not.toHaveBeenCalled();
    // Logs and metrics carry the session rate, so Sentry can extrapolate them
    expect(logs).toEqual([0.5, 0.5, 0.5]);
    expect(metrics).toEqual([0.5, 0.5, 0.5]);
    expect(outcomes()).toEqual({});
  });

  it('sends nothing but errors of an unsampled session', () => {
    const tracesSampler = vi.fn(() => 1);
    init({ sessionSampleRate: 0.5, tracesSampler });
    startSessionWithDecision(false, 0.5);

    for (let i = 0; i < 3; i++) {
      expect(spanIsSampled(startRootSpanInNewTrace())).toBe(false);
      captureOneOfEach();
    }

    expect(tracesSampler).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
    expect(metrics).toEqual([]);
    // Dropped items are reported. Errors are not among them: `sampleRate` defaults to 1.
    expect(outcomes()).toEqual({
      'sample_rate:transaction': 3,
      'sample_rate:span': 3,
      'sample_rate:log_item': 3,
      'sample_rate:trace_metric': 3,
    });
  });

  it('applies `sampleRate` to errors of an unsampled session', () => {
    init({ sessionSampleRate: 0.5, sampleRate: 0 });
    startSessionWithDecision(false, 0.5);

    captureException(new Error('boom'));

    expect(outcomes()['sample_rate:error']).toBe(1);
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

      // The session adopted 0.9, so it is unsampled: later traces, logs and metrics are dropped
      expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ sampleRand: 0.9, sampled: false });
      expect(spanIsSampled(startRootSpanInNewTrace('navigation'))).toBe(false);
      captureOneOfEach();
      expect(logs).toEqual([]);
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
        expect(getDynamicSamplingContextFromSpan(navigation).sample_rand).toBe(`${sampleRand}`);
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
        captureOneOfEach();
        expect(logs).toHaveLength(expectedSampled ? 1 : 0);
        expect(metrics).toHaveLength(expectedSampled ? 1 : 0);
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

      // The trace keeps its decision. Logs and metrics follow the (unsampled) conversation from here on.
      expect(spanIsSampled(span)).toBe(true);
      _INTERNAL_captureLog({ level: 'info', message: 'hello' }, getCurrentScope());
      expect(logs).toEqual([]);
    });
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
