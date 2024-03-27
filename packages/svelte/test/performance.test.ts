import { act, render } from '@testing-library/svelte';
import { addTracingExtensions, getClient, getCurrentScope, getIsolationScope, init, startSpan } from '../src';

import type { TransactionEvent } from '@sentry/types';
import { vi } from 'vitest';
// linter doesn't like Svelte component imports
import DummyComponent from './components/Dummy.svelte';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.trackComponent()', () => {
  const transactions: TransactionEvent[] = [];

  beforeEach(() => {
    transactions.splice(0, transactions.length);

    vi.resetAllMocks();

    getCurrentScope().clear();
    getIsolationScope().clear();

    addTracingExtensions();

    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });

    init({
      dsn: PUBLIC_DSN,
      enableTracing: true,
      beforeSendTransaction,
    });
  });

  it('creates init and update spans on component initialization', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();
      render(DummyComponent, { props: { options: {} } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.spans).toHaveLength(2);

    const rootSpanId = transaction.contexts?.trace?.span_id;
    expect(rootSpanId).toBeDefined();

    const initSpanId = transaction.spans![0].span_id;

    expect(transaction.spans![0]).toEqual({
      data: {
        'sentry.op': 'ui.svelte.init',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Dummy$>',
      op: 'ui.svelte.init',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      span_id: initSpanId,
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    expect(transaction.spans![1]).toEqual({
      data: {
        'sentry.op': 'ui.svelte.update',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Dummy$>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });
  });

  it('creates an update span, when the component is updated', async () => {
    startSpan({ name: 'outer' }, async span => {
      expect(span).toBeDefined();

      // first we create the component
      const { component } = render(DummyComponent, { props: { options: {} } });

      // then trigger an update
      // (just changing the trackUpdates prop so that we trigger an update. #
      //  The value doesn't do anything here)
      await act(() => component.$set({ options: { trackUpdates: true } }));
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.spans).toHaveLength(3);

    const rootSpanId = transaction.contexts?.trace?.span_id;
    expect(rootSpanId).toBeDefined();

    const initSpanId = transaction.spans![0].span_id;

    expect(transaction.spans![0]).toEqual({
      data: {
        'sentry.op': 'ui.svelte.init',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Dummy$>',
      op: 'ui.svelte.init',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      span_id: initSpanId,
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    expect(transaction.spans![1]).toEqual({
      data: {
        'sentry.op': 'ui.svelte.update',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Dummy$>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    expect(transaction.spans![2]).toEqual({
      data: {
        'sentry.op': 'ui.svelte.update',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Dummy$>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });
  });

  it('only creates init spans if trackUpdates is deactivated', async () => {
    startSpan({ name: 'outer' }, async span => {
      expect(span).toBeDefined();

      render(DummyComponent, { props: { options: { trackUpdates: false } } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.spans).toHaveLength(1);

    expect(transaction.spans![0].op).toEqual('ui.svelte.init');
  });

  it('only creates update spans if trackInit is deactivated', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      render(DummyComponent, { props: { options: { trackInit: false } } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.spans).toHaveLength(1);

    expect(transaction.spans![0].op).toEqual('ui.svelte.update');
  });

  it('creates no spans if trackInit and trackUpdates are deactivated', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      render(DummyComponent, { props: { options: { trackInit: false, trackUpdates: false } } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.spans).toHaveLength(0);
  });

  it('sets a custom component name as a span name if `componentName` is provided', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      render(DummyComponent, {
        props: { options: { componentName: 'CustomComponentName' } },
      });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.spans).toHaveLength(2);

    expect(transaction.spans![0].description).toEqual('<CustomComponentName>');
    expect(transaction.spans![1].description).toEqual('<CustomComponentName>');
  });

  it("doesn't do anything, if there's no ongoing transaction", async () => {
    render(DummyComponent, {
      props: { options: { componentName: 'CustomComponentName' } },
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(0);
  });

  it("doesn't record update spans, if there's no ongoing root span at that time", async () => {
    const component = startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      const { component } = render(DummyComponent, { props: { options: {} } });
      return component;
    });

    // then trigger an update after the root span ended - should not record update span
    await act(() => component.$set({ options: { trackUpdates: true } }));

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];

    // One update span is triggered by the initial rendering, but the second one is not captured
    expect(transaction.spans).toHaveLength(2);

    expect(transaction.spans![0].op).toEqual('ui.svelte.init');
    expect(transaction.spans![1].op).toEqual('ui.svelte.update');
  });
});
