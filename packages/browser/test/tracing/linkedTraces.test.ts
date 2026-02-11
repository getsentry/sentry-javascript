import type { Span } from '@sentry/core';
import { addChildSpanToSpan, debug, SentrySpan, spanToJSON, timestampInSeconds } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src';
import type { PreviousTraceInfo } from '../../src/tracing/linkedTraces';
import {
  addPreviousTraceSpanLink,
  getPreviousTraceFromSessionStorage,
  linkTraces,
  PREVIOUS_TRACE_KEY,
  PREVIOUS_TRACE_MAX_DURATION,
  PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE,
  spanContextSampled,
  storePreviousTraceInSessionStorage,
} from '../../src/tracing/linkedTraces';

describe('linkTraces', () => {
  describe('adds a previous trace span link on span start', () => {
    // @ts-expect-error - mock contains only necessary API
    const client = new BrowserClient({ transport: () => {}, integrations: [], stackParser: () => [] });

    let spanStartCb: (span: Span) => void;

    // @ts-expect-error - this is fine for testing
    const clientOnSpy = vi.spyOn(client, 'on').mockImplementation((event, cb) => {
      // @ts-expect-error - this is fine for testing
      if (event === 'spanStart') {
        spanStartCb = cb;
      }
    });

    it('registers a spanStart handler', () => {
      expect(clientOnSpy).toHaveBeenCalledWith('spanStart', expect.any(Function));
      expect(clientOnSpy).toHaveBeenCalledOnce();
    });

    beforeEach(() => {
      linkTraces(client, { linkPreviousTrace: 'in-memory', consistentTraceSampling: false });
    });

    it("doesn't add a link if the passed span is not the root span", () => {
      const rootSpan = new SentrySpan({
        name: 'test',
        parentSpanId: undefined,
        sampled: true,
        spanId: '123',
        traceId: '456',
      });

      const childSpan = new SentrySpan({
        name: 'test',
        parentSpanId: '123',
        spanId: '456',
        traceId: '789',
        sampled: true,
      });

      addChildSpanToSpan(rootSpan, childSpan);

      spanStartCb(childSpan);

      expect(spanToJSON(childSpan).links).toBeUndefined();
    });

    it('adds a link from the first trace root span to the second trace root span', () => {
      const rootSpanTrace1 = new SentrySpan({
        name: 'test',
        parentSpanId: undefined,
        sampled: true,
        spanId: '123',
        traceId: '456',
      });

      spanStartCb(rootSpanTrace1);

      expect(spanToJSON(rootSpanTrace1).links).toBeUndefined();

      const rootSpanTrace2 = new SentrySpan({
        name: 'test',
        parentSpanId: undefined,
        sampled: true,
        spanId: '789',
        traceId: 'def',
      });

      spanStartCb(rootSpanTrace2);

      expect(spanToJSON(rootSpanTrace2).links).toEqual([
        {
          attributes: {
            'sentry.link.type': 'previous_trace',
          },
          span_id: '123',
          trace_id: '456',
          sampled: true,
        },
      ]);
    });

    it("doesn't add a link to the second root span if it is part of the same trace", () => {
      const rootSpanTrace1 = new SentrySpan({
        name: 'test',
        parentSpanId: undefined,
        sampled: true,
        spanId: '123',
        traceId: 'def',
      });

      spanStartCb(rootSpanTrace1);

      expect(spanToJSON(rootSpanTrace1).links).toBeUndefined();

      const rootSpan2Trace = new SentrySpan({
        name: 'test',
        parentSpanId: undefined,
        sampled: true,
        spanId: '789',
        traceId: 'def',
      });

      spanStartCb(rootSpan2Trace);

      expect(spanToJSON(rootSpan2Trace).links).toBeUndefined();
    });
  });

  // only basic tests here, rest is tested in browser-integration-tests
  describe('consistentTraceSampling', () => {
    // @ts-expect-error - mock contains only necessary API
    const client = new BrowserClient({ transport: () => {}, integrations: [], stackParser: () => [] });
    const clientOnSpy = vi.spyOn(client, 'on');

    beforeEach(() => {
      linkTraces(client, { linkPreviousTrace: 'in-memory', consistentTraceSampling: true });
    });

    it('registers a beforeSampling handler', () => {
      expect(clientOnSpy).toHaveBeenCalledWith('spanStart', expect.any(Function));
      expect(clientOnSpy).toHaveBeenCalledWith('beforeSampling', expect.any(Function));
      expect(clientOnSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe('addPreviousTraceSpanLink', () => {
  it(`adds a previous_trace span link to startSpanOptions if the previous trace was created within ${PREVIOUS_TRACE_MAX_DURATION}s`, () => {
    const currentSpanStart = timestampInSeconds();

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      // max time reached almost exactly
      startTimestamp: currentSpanStart - PREVIOUS_TRACE_MAX_DURATION + 1,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    const currentSpan = new SentrySpan({
      name: 'test',
      startTimestamp: currentSpanStart,
      parentSpanId: '789',
      spanId: 'abc',
      traceId: 'def',
      sampled: true,
    });

    const oldPropagationContext = {
      sampleRand: 0.0126,
      traceId: '123',
      sampled: true,
      dsc: { sample_rand: '0.0126', sample_rate: '0.5' },
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan, oldPropagationContext);

    const spanJson = spanToJSON(currentSpan);

    expect(spanJson.links).toEqual([
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        trace_id: '123',
        span_id: '456',
        sampled: true,
      },
    ]);

    expect(spanJson.data).toMatchObject({
      [PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE]: '123-456-1',
    });

    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    });
  });

  it('logs a debug message when adding a previous trace link (with stringified context)', () => {
    const debugLogSpy = vi.spyOn(debug, 'log');

    const currentSpanStart = timestampInSeconds();

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: { traceId: '123', spanId: '456', traceFlags: 1 },
      startTimestamp: currentSpanStart - PREVIOUS_TRACE_MAX_DURATION + 1,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    const currentSpan = new SentrySpan({
      name: 'test',
      op: 'navigation',
      startTimestamp: currentSpanStart,
      parentSpanId: '789',
      spanId: 'abc',
      traceId: 'def',
      sampled: true,
    });

    const oldPropagationContext = {
      sampleRand: 0.0126,
      traceId: '123',
      sampled: true,
      dsc: { sample_rand: '0.0126', sample_rate: '0.5' },
    };

    addPreviousTraceSpanLink(previousTraceInfo, currentSpan, oldPropagationContext);

    expect(debugLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('[object Object]'));
    expect(debugLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Adding previous_trace `{"traceId":"123","spanId":"456","traceFlags":1}` link to span `{"op":"navigation","spanId":"abc","traceId":"def","traceFlags":1}`',
      ),
    );

    debugLogSpy.mockRestore();
  });

  it(`doesn't add a previous_trace span link if the previous trace was created more than ${PREVIOUS_TRACE_MAX_DURATION}s ago`, () => {
    const currentSpanStart = timestampInSeconds();

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 0,
      },
      startTimestamp: Date.now() / 1000 - PREVIOUS_TRACE_MAX_DURATION - 1,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    const currentSpan = new SentrySpan({
      name: '/dashboard',
      startTimestamp: currentSpanStart,
    });

    const oldPropagationContext = {
      sampleRand: 0.0126,
      traceId: '123',
      sampled: true,
      dsc: { sample_rand: '0.0126', sample_rate: '0.5' },
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan, oldPropagationContext);

    const spanJson = spanToJSON(currentSpan);

    expect(spanJson.links).toBeUndefined();

    expect(Object.keys(spanJson.data)).not.toContain(PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE);

    // but still updates the previousTraceInfo to the current span
    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    });
  });

  it("doesn't overwrite previously existing span links", () => {
    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: Date.now() / 1000,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    const oldPropagationContext = {
      sampleRand: 0.0126,
      traceId: '123',
      sampled: true,
      dsc: { sample_rand: '0.0126', sample_rate: '0.5' },
    };

    const currentSpanStart = timestampInSeconds();

    const currentSpan = new SentrySpan({
      name: '/dashboard',
      links: [
        {
          context: {
            traceId: '789',
            spanId: '101',
            traceFlags: 1,
          },
          attributes: {
            someKey: 'someValue',
          },
        },
      ],
      startTimestamp: currentSpanStart,
    });

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan, oldPropagationContext);

    expect(spanToJSON(currentSpan).links).toEqual([
      {
        trace_id: '789',
        span_id: '101',
        sampled: true,
        attributes: {
          someKey: 'someValue',
        },
      },
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        trace_id: '123',
        span_id: '456',
        sampled: true,
      },
    ]);

    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    });
  });

  it("doesn't add a link and returns the current span's data as previous trace info, if previous trace info was undefined", () => {
    const currentSpanStart = timestampInSeconds();
    const currentSpan = new SentrySpan({ name: 'test', startTimestamp: currentSpanStart });

    const oldPropagationContext = {
      sampleRand: 0.0126,
      traceId: '123',
      sampled: false,
      dsc: { sample_rand: '0.0126', sample_rate: '0.5', sampled: 'false' },
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(undefined, currentSpan, oldPropagationContext);

    const spanJson = spanToJSON(currentSpan);
    expect(spanJson.links).toBeUndefined();
    expect(Object.keys(spanJson.data)).not.toContain(PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE);

    expect(updatedPreviousTraceInfo).toEqual({
      sampleRand: 0.0126,
      sampleRate: 0.5,
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
    });
  });

  it("doesn't add a link and returns the unchanged previous trace info if the current span is part of the same trace", () => {
    const currentSpanStart = timestampInSeconds();
    const currentSpan = new SentrySpan({
      name: 'test',
      startTimestamp: currentSpanStart,
      traceId: '123',
      spanId: '456',
    });

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: currentSpanStart - 1,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    const oldPropagationContext = {
      sampleRand: 0.0126,
      traceId: '123',
      sampled: true,
      dsc: { sample_rand: '0.0126', sample_rate: '0.5' },
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan, oldPropagationContext);

    const spanJson = spanToJSON(currentSpan);
    expect(spanJson.links).toBeUndefined();
    expect(Object.keys(spanJson.data)).not.toContain(PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE);

    expect(updatedPreviousTraceInfo).toBe(previousTraceInfo);
  });
});

describe('store and retrieve previous trace data via sessionStorage ', () => {
  const storage: Record<string, unknown> = {};
  const sessionStorageMock = {
    setItem: vi.fn((key, value) => {
      storage[key] = value;
    }),
    getItem: vi.fn(key => storage[key]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mock contains only necessary API
    globalThis.sessionStorage = sessionStorageMock;
  });

  it('stores the previous trace info in sessionStorage', () => {
    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: Date.now() / 1000,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    storePreviousTraceInSessionStorage(previousTraceInfo);
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(PREVIOUS_TRACE_KEY, JSON.stringify(previousTraceInfo));
    expect(getPreviousTraceFromSessionStorage()).toEqual(previousTraceInfo);
  });

  it("doesn't throw if accessing sessionStorage fails and returns undefined", () => {
    // @ts-expect-error - this is fine
    globalThis.sessionStorage = undefined;

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: Date.now() / 1000,
      sampleRand: 0.0126,
      sampleRate: 0.5,
    };

    expect(() => storePreviousTraceInSessionStorage(previousTraceInfo)).not.toThrow();
    expect(getPreviousTraceFromSessionStorage).not.toThrow();
    expect(getPreviousTraceFromSessionStorage()).toBeUndefined();
  });
});

describe('spanContextSampled', () => {
  it('returns true if traceFlags is 1', () => {
    const spanContext = {
      traceId: '123',
      spanId: '456',
      traceFlags: 1,
    };

    expect(spanContextSampled(spanContext)).toBe(true);
  });

  it.each([0, 2, undefined as unknown as number])('returns false if traceFlags is %s', flags => {
    const spanContext = {
      traceId: '123',
      spanId: '456',
      traceFlags: flags,
    };
    expect(spanContextSampled(spanContext)).toBe(false);
  });
});
