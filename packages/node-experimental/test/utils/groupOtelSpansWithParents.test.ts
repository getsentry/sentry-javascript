import { groupOtelSpansWithParents } from '../../src/utils/groupOtelSpansWithParents';
import { createSpan } from '../helpers/createSpan';

describe('groupOtelSpansWithParents', () => {
  it('works with no spans', () => {
    const actual = groupOtelSpansWithParents([]);
    expect(actual).toEqual([]);
  });

  it('works with a single root span & in-order spans', () => {
    const rootSpan = createSpan('root', { spanId: 'rootId' });
    const parentSpan1 = createSpan('parent1', { spanId: 'parent1Id', parentSpanId: 'rootId' });
    const parentSpan2 = createSpan('parent2', { spanId: 'parent2Id', parentSpanId: 'rootId' });
    const child1 = createSpan('child1', { spanId: 'child1', parentSpanId: 'parent1Id' });

    const actual = groupOtelSpansWithParents([rootSpan, parentSpan1, parentSpan2, child1]);
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
    const parentSpan1 = createSpan('parent1', { spanId: 'parent1Id', parentSpanId: 'rootId' });
    const parentSpan2 = createSpan('parent2', { spanId: 'parent2Id', parentSpanId: 'rootId' });
    const child1 = createSpan('child1', { spanId: 'child1', parentSpanId: 'parent1Id' });

    const actual = groupOtelSpansWithParents([parentSpan1, parentSpan2, child1]);
    expect(actual).toHaveLength(4);

    // Ensure parent & span is correctly set
    const rootRef = actual.find(ref => ref.id === 'rootId');
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
    const rootSpan1 = createSpan('root1', { spanId: 'root1Id' });
    const rootSpan2 = createSpan('root2', { spanId: 'root2Id' });
    const parentSpan1 = createSpan('parent1', { spanId: 'parent1Id', parentSpanId: 'root1Id' });
    const parentSpan2 = createSpan('parent2', { spanId: 'parent2Id', parentSpanId: 'root2Id' });
    const childSpan1 = createSpan('child1', { spanId: 'child1Id', parentSpanId: 'parent1Id' });

    const actual = groupOtelSpansWithParents([childSpan1, parentSpan1, parentSpan2, rootSpan2, rootSpan1]);
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
