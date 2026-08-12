import { context, trace } from '@opentelemetry/api';
import { getRootSpan, Scope } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { setContextOnScope } from '../../../src/opentelemetry/utils/contextData';
import { getActiveSpan } from '../../../src/opentelemetry/utils/getActiveSpan';
import { mockSdkInit } from '../helpers/mockSdkInit';

describe('getActiveSpan', () => {
  beforeEach(() => {
    mockSdkInit();
  });

  it('returns undefined if no span is active', () => {
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

  describe('with a scope argument', () => {
    it('returns the span of the context bound to the passed-in scope', () => {
      const tracer = trace.getTracer('test');

      tracer.startActiveSpan('scope-span', span => {
        const ctx = trace.setSpan(context.active(), span);
        const scope = new Scope();
        setContextOnScope(scope, ctx);

        expect(getActiveSpan(scope)).toBe(span);

        span.end();
      });
    });

    it('reads the span from the passed-in scope instead of the currently active context', () => {
      const tracer = trace.getTracer('test');

      tracer.startActiveSpan('scope-span', scopeSpan => {
        const scopedCtx = trace.setSpan(context.active(), scopeSpan);
        const scope = new Scope();
        setContextOnScope(scope, scopedCtx);

        scopeSpan.end();

        tracer.startActiveSpan('active-span', activeSpan => {
          // The active context has `activeSpan`, but the passed-in scope points at `scopeSpan`
          expect(getActiveSpan()).toBe(activeSpan);
          expect(getActiveSpan(scope)).toBe(scopeSpan);

          activeSpan.end();
        });
      });
    });

    it('returns undefined if the passed-in scope has no context bound to it', () => {
      const scope = new Scope();

      const tracer = trace.getTracer('test');
      tracer.startActiveSpan('active-span', span => {
        // A scope without a bound context must not fall back to the active context
        expect(getActiveSpan(scope)).toBeUndefined();

        span.end();
      });
    });

    it('returns undefined if the context bound to the passed-in scope has no span', () => {
      const scope = new Scope();
      setContextOnScope(scope, context.active());

      expect(getActiveSpan(scope)).toBeUndefined();
    });
  });
});

describe('getRootSpan', () => {
  beforeEach(() => {
    mockSdkInit();
  });

  it('returns currently active root span', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test', span => {
      expect(getRootSpan(span)).toBe(span);

      const inner1 = tracer.startSpan('inner1');

      expect(getRootSpan(inner1)).toBe(span);

      inner1.end();

      tracer.startActiveSpan('inner2', inner2 => {
        expect(getRootSpan(inner2)).toBe(span);

        inner2.end();
      });

      span.end();
    });
  });

  it('returns currently active root span in concurrent spans', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test1', span => {
      expect(getRootSpan(span)).toBe(span);

      tracer.startActiveSpan('inner1', inner1 => {
        expect(getRootSpan(inner1)).toBe(span);
        inner1.end();
      });

      span.end();
    });

    tracer.startActiveSpan('test2', span => {
      expect(getRootSpan(span)).toBe(span);

      tracer.startActiveSpan('inner2', inner => {
        expect(getRootSpan(inner)).toBe(span);
        inner.end();
      });

      span.end();
    });
  });
});
