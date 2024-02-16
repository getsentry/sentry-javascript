import type { Scope } from '@sentry/core';
import { act, render } from '@testing-library/svelte';

import { vi } from 'vitest';
// linter doesn't like Svelte component imports
import DummyComponent from './components/Dummy.svelte';

let returnUndefinedTransaction = false;

const testTransaction: { spans: any[]; startChild: jest.Mock; end: jest.Mock; isRecording: () => boolean } = {
  spans: [],
  startChild: vi.fn(),
  end: vi.fn(),
  isRecording: () => true,
};
const testUpdateSpan = { end: vi.fn() };
const testInitSpan: any = {
  transaction: testTransaction,
  end: vi.fn(),
  startChild: vi.fn(),
  isRecording: () => true,
};

vi.mock('@sentry/core', async () => {
  const original = await vi.importActual('@sentry/core');
  return {
    ...original,
    getCurrentScope(): Scope {
      return {
        getTransaction: () => {
          return returnUndefinedTransaction ? undefined : testTransaction;
        },
      } as Scope;
    },
  };
});

describe('Sentry.trackComponent()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    testTransaction.spans = [];

    testTransaction.startChild.mockImplementation(spanCtx => {
      testTransaction.spans.push(spanCtx);
      return testInitSpan;
    });

    testInitSpan.startChild.mockImplementation((spanCtx: any) => {
      testTransaction.spans.push(spanCtx);
      return testUpdateSpan;
    });

    testInitSpan.end = vi.fn();
    testInitSpan.isRecording = () => true;
    returnUndefinedTransaction = false;
  });

  it('creates nested init and update spans on component initialization', () => {
    render(DummyComponent, { props: { options: {} } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy$>',
      op: 'ui.svelte.init',
      origin: 'auto.ui.svelte',
    });

    expect(testInitSpan.startChild).toHaveBeenCalledWith({
      description: '<Dummy$>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
    });

    expect(testInitSpan.end).toHaveBeenCalledTimes(1);
    expect(testUpdateSpan.end).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(2);
  });

  it('creates an update span, when the component is updated', async () => {
    // Make the end() function actually end the initSpan
    testInitSpan.end.mockImplementation(() => {
      testInitSpan.isRecording = () => false;
    });

    // first we create the component
    const { component } = render(DummyComponent, { props: { options: {} } });

    // then trigger an update
    // (just changing the trackUpdates prop so that we trigger an update. #
    //  The value doesn't do anything here)
    await act(() => component.$set({ options: { trackUpdates: true } }));

    // once for init (unimportant here), once for starting the update span
    expect(testTransaction.startChild).toHaveBeenCalledTimes(2);
    expect(testTransaction.startChild).toHaveBeenLastCalledWith({
      description: '<Dummy$>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
    });
    expect(testTransaction.spans.length).toEqual(3);
  });

  it('only creates init spans if trackUpdates is deactivated', () => {
    render(DummyComponent, { props: { options: { trackUpdates: false } } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy$>',
      op: 'ui.svelte.init',
      origin: 'auto.ui.svelte',
    });

    expect(testInitSpan.startChild).not.toHaveBeenCalled();

    expect(testInitSpan.end).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(1);
  });

  it('only creates update spans if trackInit is deactivated', () => {
    render(DummyComponent, { props: { options: { trackInit: false } } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy$>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
    });

    expect(testInitSpan.startChild).not.toHaveBeenCalled();

    expect(testInitSpan.end).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(1);
  });

  it('creates no spans if trackInit and trackUpdates are deactivated', () => {
    render(DummyComponent, { props: { options: { trackInit: false, trackUpdates: false } } });

    expect(testTransaction.startChild).not.toHaveBeenCalled();
    expect(testInitSpan.startChild).not.toHaveBeenCalled();
    expect(testTransaction.spans.length).toEqual(0);
  });

  it('sets a custom component name as a span description if `componentName` is provided', async () => {
    render(DummyComponent, {
      props: { options: { componentName: 'CustomComponentName' } },
    });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<CustomComponentName>',
      op: 'ui.svelte.init',
      origin: 'auto.ui.svelte',
    });

    expect(testInitSpan.startChild).toHaveBeenCalledWith({
      description: '<CustomComponentName>',
      op: 'ui.svelte.update',
      origin: 'auto.ui.svelte',
    });

    expect(testInitSpan.end).toHaveBeenCalledTimes(1);
    expect(testUpdateSpan.end).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(2);
  });

  it("doesn't do anything, if there's no ongoing transaction", async () => {
    returnUndefinedTransaction = true;

    render(DummyComponent, {
      props: { options: { componentName: 'CustomComponentName' } },
    });

    expect(testInitSpan.end).toHaveBeenCalledTimes(0);
    expect(testUpdateSpan.end).toHaveBeenCalledTimes(0);
    expect(testTransaction.spans.length).toEqual(0);
  });

  it("doesn't record update spans, if there's no ongoing transaction at that time", async () => {
    // Make the end() function actually end the initSpan
    testInitSpan.end.mockImplementation(() => {
      testInitSpan.isRecording = () => false;
    });

    // first we create the component
    const { component } = render(DummyComponent, { props: { options: {} } });

    // then clear the current transaction and trigger an update
    returnUndefinedTransaction = true;
    await act(() => component.$set({ options: { trackUpdates: true } }));

    // we should only record the init spans (including the initial update)
    // but not the second update
    expect(testTransaction.startChild).toHaveBeenCalledTimes(1);
    expect(testTransaction.startChild).toHaveBeenLastCalledWith({
      description: '<Dummy$>',
      op: 'ui.svelte.init',
      origin: 'auto.ui.svelte',
    });
    expect(testTransaction.spans.length).toEqual(2);
  });
});
