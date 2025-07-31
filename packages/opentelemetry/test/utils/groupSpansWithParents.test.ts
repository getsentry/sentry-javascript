import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Span } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withActiveSpan } from '../../src/trace';
import { groupSpansWithParents } from '../../src/utils/groupSpansWithParents';
import { setupOtel } from '../helpers/initOtel';
import { cleanupOtel } from '../helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('groupSpansWithParents', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    [provider] = setupOtel(client);
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  it('works with no spans', () => {
    const actual = groupSpansWithParents([]);
    expect(actual).toEqual([]);
  });

  it('works with a single root span & in-order spans', () => {
    const tracer = trace.getTracer('test');
    const rootSpan = tracer.startSpan('root') as unknown as ReadableSpan;
    const parentSpan1 = withActiveSpan(
      rootSpan as unknown as Span,
      () => tracer.startSpan('parent1') as unknown as ReadableSpan,
    );
    const parentSpan2 = withActiveSpan(
      rootSpan as unknown as Span,
      () => tracer.startSpan('parent2') as unknown as ReadableSpan,
    );
    const child1 = withActiveSpan(
      parentSpan1 as unknown as Span,
      () => tracer.startSpan('child1') as unknown as ReadableSpan,
    );

    const actual = groupSpansWithParents([rootSpan, parentSpan1, parentSpan2, child1]);
    expect(actual).toHaveLength(4);

    // Ensure parent & span is correctly set
    const rootRef = actual.find(ref => ref.span === rootSpan);
    const parent1Ref = actual.find(ref => ref.span === parentSpan1);
    const parent2Ref = actual.find(ref => ref.span === parentSpan2);
    const child1Ref = actual.find(ref => ref.span === child1);

    expect(rootRef).toBeDefined();
    expect(parent1Ref).toBeDefined();
    expect(parent2Ref).toBeDefined();
    expect(child1Ref).toBeDefined();

    expect(rootRef?.parentNode).toBeUndefined();
    expect(rootRef?.children).toEqual([parent1Ref, parent2Ref]);

    expect(parent1Ref?.span).toBe(parentSpan1);
    expect(parent2Ref?.span).toBe(parentSpan2);

    expect(parent1Ref?.parentNode).toBe(rootRef);
    expect(parent2Ref?.parentNode).toBe(rootRef);

    expect(parent1Ref?.children).toEqual([child1Ref]);
    expect(parent2Ref?.children).toEqual([]);

    expect(child1Ref?.parentNode).toBe(parent1Ref);
    expect(child1Ref?.children).toEqual([]);
  });

  it('works with a spans with missing root span', () => {
    const tracer = trace.getTracer('test');

    // We create this root span here, but we do not pass it to `groupSpansWithParents` below
    const rootSpan = tracer.startSpan('root') as unknown as ReadableSpan;
    const parentSpan1 = withActiveSpan(
      rootSpan as unknown as Span,
      () => tracer.startSpan('parent1') as unknown as ReadableSpan,
    );
    const parentSpan2 = withActiveSpan(
      rootSpan as unknown as Span,
      () => tracer.startSpan('parent2') as unknown as ReadableSpan,
    );
    const child1 = withActiveSpan(
      parentSpan1 as unknown as Span,
      () => tracer.startSpan('child1') as unknown as ReadableSpan,
    );

    const actual = groupSpansWithParents([parentSpan1, parentSpan2, child1]);
    expect(actual).toHaveLength(4);

    // Ensure parent & span is correctly set
    const rootRef = actual.find(ref => ref.id === rootSpan.spanContext().spanId);
    const parent1Ref = actual.find(ref => ref.span === parentSpan1);
    const parent2Ref = actual.find(ref => ref.span === parentSpan2);
    const child1Ref = actual.find(ref => ref.span === child1);

    expect(rootRef).toBeDefined();
    expect(parent1Ref).toBeDefined();
    expect(parent2Ref).toBeDefined();
    expect(child1Ref).toBeDefined();

    expect(rootRef?.parentNode).toBeUndefined();
    expect(rootRef?.span).toBeUndefined();
    expect(rootRef?.children).toEqual([parent1Ref, parent2Ref]);

    expect(parent1Ref?.span).toBe(parentSpan1);
    expect(parent2Ref?.span).toBe(parentSpan2);

    expect(parent1Ref?.parentNode).toBe(rootRef);
    expect(parent2Ref?.parentNode).toBe(rootRef);

    expect(parent1Ref?.children).toEqual([child1Ref]);
    expect(parent2Ref?.children).toEqual([]);

    expect(child1Ref?.parentNode).toBe(parent1Ref);
    expect(child1Ref?.children).toEqual([]);
  });

  it('works with multiple root spans & out-of-order spans', () => {
    const tracer = trace.getTracer('test');
    const rootSpan1 = tracer.startSpan('root1') as unknown as ReadableSpan;
    const rootSpan2 = tracer.startSpan('root2') as unknown as ReadableSpan;
    const parentSpan1 = withActiveSpan(
      rootSpan1 as unknown as Span,
      () => tracer.startSpan('parent1') as unknown as ReadableSpan,
    );
    const parentSpan2 = withActiveSpan(
      rootSpan2 as unknown as Span,
      () => tracer.startSpan('parent2') as unknown as ReadableSpan,
    );
    const childSpan1 = withActiveSpan(
      parentSpan1 as unknown as Span,
      () => tracer.startSpan('child1') as unknown as ReadableSpan,
    );

    const actual = groupSpansWithParents([childSpan1, parentSpan1, parentSpan2, rootSpan2, rootSpan1]);
    expect(actual).toHaveLength(5);

    // Ensure parent & span is correctly set
    const root1Ref = actual.find(ref => ref.span === rootSpan1);
    const root2Ref = actual.find(ref => ref.span === rootSpan2);
    const parent1Ref = actual.find(ref => ref.span === parentSpan1);
    const parent2Ref = actual.find(ref => ref.span === parentSpan2);
    const child1Ref = actual.find(ref => ref.span === childSpan1);

    expect(root1Ref).toBeDefined();
    expect(root2Ref).toBeDefined();
    expect(parent1Ref).toBeDefined();
    expect(parent2Ref).toBeDefined();
    expect(child1Ref).toBeDefined();

    expect(root1Ref?.parentNode).toBeUndefined();
    expect(root1Ref?.children).toEqual([parent1Ref]);

    expect(root2Ref?.parentNode).toBeUndefined();
    expect(root2Ref?.children).toEqual([parent2Ref]);

    expect(parent1Ref?.span).toBe(parentSpan1);
    expect(parent2Ref?.span).toBe(parentSpan2);

    expect(parent1Ref?.parentNode).toBe(root1Ref);
    expect(parent2Ref?.parentNode).toBe(root2Ref);

    expect(parent1Ref?.children).toEqual([child1Ref]);
    expect(parent2Ref?.children).toEqual([]);

    expect(child1Ref?.parentNode).toBe(parent1Ref);
    expect(child1Ref?.children).toEqual([]);
  });
});
