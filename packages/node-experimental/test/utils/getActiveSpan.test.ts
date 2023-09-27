import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

import { setupOtel } from '../../src/sdk/initOtel';
import type { OtelSpan } from '../../src/types';
import { getActiveSpan, getRootSpan } from '../../src/utils/getActiveSpan';
import { cleanupOtel } from '../helpers/mockSdkInit';

describe('getActiveSpan', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    provider = setupOtel();
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  it('returns undefined if no span is active', () => {
    const span = getActiveSpan();
    expect(span).toBeUndefined();
  });

  it('returns undefined if no provider is active', async () => {
    await provider?.forceFlush();
    await provider?.shutdown();
    provider = undefined;

    const span = getActiveSpan();
    expect(span).toBeUndefined();
  });

  it('returns currently active span', () => {
    const tracer = trace.getTracer('test');

    expect(getActiveSpan()).toBeUndefined();

    tracer.startActiveSpan('test', span => {
      expect(getActiveSpan()).toBe(span);

      const inner1 = tracer.startSpan('inner1');

      expect(getActiveSpan()).toBe(span);

      inner1.end();

      tracer.startActiveSpan('inner2', inner2 => {
        expect(getActiveSpan()).toBe(inner2);

        inner2.end();
      });

      expect(getActiveSpan()).toBe(span);

      span.end();
    });

    expect(getActiveSpan()).toBeUndefined();
  });

  it('returns currently active span in concurrent spans', () => {
    const tracer = trace.getTracer('test');

    expect(getActiveSpan()).toBeUndefined();

    tracer.startActiveSpan('test1', span => {
      expect(getActiveSpan()).toBe(span);

      tracer.startActiveSpan('inner1', inner1 => {
        expect(getActiveSpan()).toBe(inner1);
        inner1.end();
      });

      span.end();
    });

    tracer.startActiveSpan('test2', span => {
      expect(getActiveSpan()).toBe(span);

      tracer.startActiveSpan('inner2', inner => {
        expect(getActiveSpan()).toBe(inner);
        inner.end();
      });

      span.end();
    });

    expect(getActiveSpan()).toBeUndefined();
  });
});

describe('getRootSpan', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    provider = setupOtel();
  });

  afterEach(async () => {
    await provider?.forceFlush();
    await provider?.shutdown();
  });

  it('returns currently active root span', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test', span => {
      expect(getRootSpan(span as OtelSpan)).toBe(span);

      const inner1 = tracer.startSpan('inner1');

      expect(getRootSpan(inner1 as OtelSpan)).toBe(span);

      inner1.end();

      tracer.startActiveSpan('inner2', inner2 => {
        expect(getRootSpan(inner2 as OtelSpan)).toBe(span);

        inner2.end();
      });

      span.end();
    });
  });

  it('returns currently active root span in concurrent spans', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test1', span => {
      expect(getRootSpan(span as OtelSpan)).toBe(span);

      tracer.startActiveSpan('inner1', inner1 => {
        expect(getRootSpan(inner1 as OtelSpan)).toBe(span);
        inner1.end();
      });

      span.end();
    });

    tracer.startActiveSpan('test2', span => {
      expect(getRootSpan(span as OtelSpan)).toBe(span);

      tracer.startActiveSpan('inner2', inner => {
        expect(getRootSpan(inner as OtelSpan)).toBe(span);
        inner.end();
      });

      span.end();
    });
  });
});
