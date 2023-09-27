import * as Sentry from '../../src';
import { OTEL_ATTR_OP, OTEL_ATTR_ORIGIN, OTEL_ATTR_SOURCE } from '../../src/constants';
import { getOtelSpanMetadata } from '../../src/opentelemetry/spanData';
import type { OtelSpan } from '../../src/types';
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
      const spans: OtelSpan[] = [];

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
      const spans: OtelSpan[] = [];

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
      const spans1: OtelSpan[] = [];
      const spans2: OtelSpan[] = [];

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
          expect(span?.attributes).toEqual({});

          expect(getOtelSpanMetadata(span!)).toEqual(undefined);
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
          });

          expect(getOtelSpanMetadata(span!)).toEqual({ requestPath: 'test-path' });
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
      expect(span?.attributes).toEqual({});

      expect(getOtelSpanMetadata(span!)).toEqual(undefined);

      const span2 = Sentry.startInactiveSpan({
        name: 'outer',
        op: 'my-op',
        origin: 'auto.test.origin',
        source: 'task',
        metadata: { requestPath: 'test-path' },
      });

      expect(span2).toBeDefined();
      expect(span2?.attributes).toEqual({
        [OTEL_ATTR_SOURCE]: 'task',
        [OTEL_ATTR_ORIGIN]: 'auto.test.origin',
        [OTEL_ATTR_OP]: 'my-op',
      });

      expect(getOtelSpanMetadata(span2!)).toEqual({ requestPath: 'test-path' });
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
