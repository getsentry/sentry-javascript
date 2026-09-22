/**
 * @vitest-environment jsdom
 */

import type { TransactionEvent } from '@sentry/core';
import { getMainCarrier, spanToJSON, UI_COMPONENT_SPAN_NAME_FALLBACK } from '@sentry/core';
import { act, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient, init, startSpan } from '../src';
import DummyComponent from './components/Dummy.svelte';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.trackComponent()', () => {
  const transactions: TransactionEvent[] = [];

  beforeEach(() => {
    transactions.splice(0, transactions.length);

    vi.resetAllMocks();

    getMainCarrier().__SENTRY__ = undefined;

    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });

    init({
      dsn: PUBLIC_DSN,
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      beforeSendTransaction,
    });
  });

  it('creates init spans on component initialization by default', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();
      render(DummyComponent, { props: { options: {} } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;
    expect(transaction.spans).toHaveLength(1);

    const rootSpanId = transaction.contexts?.trace?.span_id;
    expect(rootSpanId).toBeDefined();

    const initSpanId = transaction.spans![0]?.span_id;

    expect(transaction.spans![0]).toEqual({
      data: {
        'sentry.op': 'ui.mount',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Svelte Component>',
      exclusive_time: undefined,
      links: undefined,
      measurements: undefined,
      op: 'ui.mount',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      profile_id: undefined,
      span_id: initSpanId,
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      status: 'ok',
    });
  });

  it('creates an update span, if `trackUpdates` is `true`', async () => {
    startSpan({ name: 'outer' }, async span => {
      expect(span).toBeDefined();

      // first we create the component
      const { component } = render(DummyComponent, { props: { options: { trackUpdates: true } } });

      // then trigger an update
      // (just changing the trackUpdates prop so that we trigger an update. #
      //  The value doesn't do anything here)
      await act(() => component.$set({ options: { trackUpdates: true } }));
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;
    expect(transaction.spans).toHaveLength(3);

    const rootSpanId = transaction.contexts?.trace?.span_id;
    expect(rootSpanId).toBeDefined();

    const initSpanId = transaction.spans![0]?.span_id;

    expect(transaction.spans![0]).toEqual({
      data: {
        'sentry.op': 'ui.mount',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Svelte Component>',
      exclusive_time: undefined,
      links: undefined,
      measurements: undefined,
      op: 'ui.mount',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      profile_id: undefined,
      span_id: initSpanId,
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      status: 'ok',
    });

    expect(transaction.spans![1]).toEqual({
      data: {
        'sentry.op': 'ui.update',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Svelte Component>',
      exclusive_time: undefined,
      links: undefined,
      measurements: undefined,
      op: 'ui.update',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      profile_id: undefined,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      status: 'ok',
    });

    expect(transaction.spans![2]).toEqual({
      data: {
        'sentry.op': 'ui.update',
        'sentry.origin': 'auto.ui.svelte',
      },
      description: '<Svelte Component>',
      exclusive_time: undefined,
      links: undefined,
      measurements: undefined,
      op: 'ui.update',
      origin: 'auto.ui.svelte',
      parent_span_id: rootSpanId,
      profile_id: undefined,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      status: 'ok',
    });
  });

  it('only creates init spans if trackUpdates is deactivated', async () => {
    startSpan({ name: 'outer' }, async span => {
      expect(span).toBeDefined();

      render(DummyComponent, { props: { options: { trackUpdates: false } } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;
    expect(transaction.spans).toHaveLength(1);

    expect(transaction.spans![0]?.op).toEqual('ui.mount');
  });

  it('only creates update spans if trackInit is deactivated', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      render(DummyComponent, { props: { options: { trackInit: false, trackUpdates: true } } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;
    expect(transaction.spans).toHaveLength(1);

    expect(transaction.spans![0]?.op).toEqual('ui.update');
  });

  it('creates no spans if trackInit and trackUpdates are deactivated', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      render(DummyComponent, { props: { options: { trackInit: false, trackUpdates: false } } });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;
    expect(transaction.spans).toHaveLength(0);
  });

  it('sets a custom component name as a span name if `componentName` is provided', async () => {
    startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      render(DummyComponent, {
        props: {
          options: {
            componentName: 'CustomComponentName',
            // enabling updates to check for both span names in one test
            trackUpdates: true,
          },
        },
      });
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;
    expect(transaction.spans).toHaveLength(2);

    expect(transaction.spans![0]?.description).toEqual('<CustomComponentName>');
    expect(transaction.spans![0]?.data).toMatchObject({ 'ui.component_name': 'CustomComponentName' });
    expect(transaction.spans![1]?.description).toEqual('<CustomComponentName>');
    expect(transaction.spans![1]?.data).toMatchObject({ 'ui.component_name': 'CustomComponentName' });
  });

  it("doesn't do anything, if there's no ongoing parent span", async () => {
    render(DummyComponent, {
      props: { options: { componentName: 'CustomComponentName' } },
    });

    await getClient()?.flush();

    expect(transactions).toHaveLength(0);
  });

  it("doesn't record update spans, if there's no ongoing parent span at that time", async () => {
    const component = startSpan({ name: 'outer' }, span => {
      expect(span).toBeDefined();

      const { component } = render(DummyComponent, { props: { options: { trackUpdates: true } } });
      return component;
    });

    // then trigger an update after the root span ended - should not record update span
    await act(() => component.$set({ options: { trackUpdates: true } }));

    await getClient()?.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;

    // One update span is triggered by the initial rendering, but the second one is not captured
    expect(transaction.spans).toHaveLength(2);

    expect(transaction.spans![0]?.op).toEqual('ui.mount');
    expect(transaction.spans![1]?.op).toEqual('ui.update');
  });

  it('names component spans after the component and preserves the bracketed description when span streaming is enabled', async () => {
    getMainCarrier().__SENTRY__ = undefined;

    const ended: Array<{ name: string; attributes: Record<string, unknown> }> = [];

    init({
      dsn: PUBLIC_DSN,
      tracesSampleRate: 1,
      traceLifecycle: 'stream',
    });

    getClient()?.on('spanEnd', span => {
      const json = spanToJSON(span);
      if (json.attributes?.['sentry.origin'] === 'auto.ui.svelte') {
        ended.push({ name: json.name, attributes: json.attributes as Record<string, unknown> });
      }
    });

    startSpan({ name: 'outer' }, () => {
      render(DummyComponent, { props: { options: { componentName: 'CustomComponentName' } } });
    });

    await getClient()?.flush();

    expect(ended).toHaveLength(1);
    expect(ended[0]!.name).toBe('CustomComponentName');
    expect(ended[0]!.attributes['sentry.description']).toBe('<CustomComponentName>');
    expect(ended[0]!.attributes['ui.component_name']).toBe('CustomComponentName');
  });

  it('uses the UI component fallback when no component name is available', async () => {
    getMainCarrier().__SENTRY__ = undefined;
    const ended: Array<{ name: string; attributes: Record<string, unknown> }> = [];

    init({
      dsn: PUBLIC_DSN,
      tracesSampleRate: 1,
      traceLifecycle: 'stream',
    });
    getClient()?.on('spanEnd', span => {
      const json = spanToJSON(span);
      if (json.attributes?.['sentry.origin'] === 'auto.ui.svelte') {
        ended.push({ name: json.name, attributes: json.attributes as Record<string, unknown> });
      }
    });

    startSpan({ name: 'outer' }, () => {
      render(DummyComponent, { props: { options: {} } });
    });
    await getClient()?.flush();

    expect(ended).toHaveLength(1);
    expect(ended[0]!.name).toBe(UI_COMPONENT_SPAN_NAME_FALLBACK);
    expect(ended[0]!.attributes['sentry.description']).toBe('<Svelte Component>');
    expect(ended[0]!.attributes['ui.component_name']).toBeUndefined();
  });
});
