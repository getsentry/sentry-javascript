import { Span, Transaction } from '@sentry/core';

import * as Sentry from '../../src';
import { mockSdkInit } from '../helpers/mockSdkInit';

describe('trace', () => {
  beforeEach(() => {
    mockSdkInit({ enableTracing: true });
  });

  describe('startSpan', () => {
    it('works with a sync callback', () => {
      const spans: Span[] = [];

      expect(Sentry.getActiveSpan()).toEqual(undefined);

      Sentry.startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans.push(outerSpan!);

        expect(outerSpan?.name).toEqual('outer');
        expect(outerSpan).toBeInstanceOf(Transaction);
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);

        Sentry.startSpan({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans.push(innerSpan!);

          expect(innerSpan?.description).toEqual('inner');
          expect(innerSpan).toBeInstanceOf(Span);
          expect(innerSpan).not.toBeInstanceOf(Transaction);
          expect(Sentry.getActiveSpan()).toEqual(innerSpan);
        });
      });

      expect(Sentry.getActiveSpan()).toEqual(undefined);
      expect(spans).toHaveLength(2);
      const [outerSpan, innerSpan] = spans;

      expect((outerSpan as Transaction).name).toEqual('outer');
      expect(innerSpan.description).toEqual('inner');

      expect(outerSpan.endTimestamp).toEqual(expect.any(Number));
      expect(innerSpan.endTimestamp).toEqual(expect.any(Number));
    });

    it('works with an async callback', async () => {
      const spans: Span[] = [];

      expect(Sentry.getActiveSpan()).toEqual(undefined);

      await Sentry.startSpan({ name: 'outer' }, async outerSpan => {
        expect(outerSpan).toBeDefined();
        spans.push(outerSpan!);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(outerSpan?.name).toEqual('outer');
        expect(outerSpan).toBeInstanceOf(Transaction);
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);

        await Sentry.startSpan({ name: 'inner' }, async innerSpan => {
          expect(innerSpan).toBeDefined();
          spans.push(innerSpan!);

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(innerSpan?.description).toEqual('inner');
          expect(innerSpan).toBeInstanceOf(Span);
          expect(innerSpan).not.toBeInstanceOf(Transaction);
          expect(Sentry.getActiveSpan()).toEqual(innerSpan);
        });
      });

      expect(Sentry.getActiveSpan()).toEqual(undefined);
      expect(spans).toHaveLength(2);
      const [outerSpan, innerSpan] = spans;

      expect((outerSpan as Transaction).name).toEqual('outer');
      expect(innerSpan.description).toEqual('inner');

      expect(outerSpan.endTimestamp).toEqual(expect.any(Number));
      expect(innerSpan.endTimestamp).toEqual(expect.any(Number));
    });

    it('works with multiple parallel calls', () => {
      const spans1: Span[] = [];
      const spans2: Span[] = [];

      expect(Sentry.getActiveSpan()).toEqual(undefined);

      Sentry.startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans1.push(outerSpan!);

        expect(outerSpan?.name).toEqual('outer');
        expect(outerSpan).toBeInstanceOf(Transaction);
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);

        Sentry.startSpan({ name: 'inner' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans1.push(innerSpan!);

          expect(innerSpan?.description).toEqual('inner');
          expect(innerSpan).toBeInstanceOf(Span);
          expect(innerSpan).not.toBeInstanceOf(Transaction);
          expect(Sentry.getActiveSpan()).toEqual(innerSpan);
        });
      });

      Sentry.startSpan({ name: 'outer2' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        spans2.push(outerSpan!);

        expect(outerSpan?.name).toEqual('outer2');
        expect(outerSpan).toBeInstanceOf(Transaction);
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);

        Sentry.startSpan({ name: 'inner2' }, innerSpan => {
          expect(innerSpan).toBeDefined();
          spans2.push(innerSpan!);

          expect(innerSpan?.description).toEqual('inner2');
          expect(innerSpan).toBeInstanceOf(Span);
          expect(innerSpan).not.toBeInstanceOf(Transaction);
          expect(Sentry.getActiveSpan()).toEqual(innerSpan);
        });
      });

      expect(Sentry.getActiveSpan()).toEqual(undefined);
      expect(spans1).toHaveLength(2);
      expect(spans2).toHaveLength(2);
    });
  });

  describe('startInactiveSpan', () => {
    it('works at the root', () => {
      const span = Sentry.startInactiveSpan({ name: 'test' });

      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(Transaction);
      expect(span?.name).toEqual('test');
      expect(span?.endTimestamp).toBeUndefined();
      expect(Sentry.getActiveSpan()).toBeUndefined();

      span?.finish();

      expect(span?.endTimestamp).toEqual(expect.any(Number));
      expect(Sentry.getActiveSpan()).toBeUndefined();
    });

    it('works as a child span', () => {
      Sentry.startSpan({ name: 'outer' }, outerSpan => {
        expect(outerSpan).toBeDefined();
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);

        const innerSpan = Sentry.startInactiveSpan({ name: 'test' });

        expect(innerSpan).toBeDefined();
        expect(innerSpan).toBeInstanceOf(Span);
        expect(innerSpan).not.toBeInstanceOf(Transaction);
        expect(innerSpan?.description).toEqual('test');
        expect(innerSpan?.endTimestamp).toBeUndefined();
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);

        innerSpan?.finish();

        expect(innerSpan?.endTimestamp).toEqual(expect.any(Number));
        expect(Sentry.getActiveSpan()).toEqual(outerSpan);
      });
    });
  });
});
