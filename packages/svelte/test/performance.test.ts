import type { Scope } from '@sentry/core';
import { act, render } from '@testing-library/svelte';

// linter doesn't like Svelte component imports
// eslint-disable-next-line import/no-unresolved
import DummyComponent from './components/Dummy.svelte';

let returnUndefinedTransaction = false;

const testTransaction: { spans: any[]; startChild: jest.Mock; finish: jest.Mock } = {
  spans: [],
  startChild: jest.fn(),
  finish: jest.fn(),
};
const testUpdateSpan = { finish: jest.fn() };
const testInitSpan: any = {
  transaction: testTransaction,
  finish: jest.fn(),
  startChild: jest.fn(),
};

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getCurrentHub(): {
      getScope(): Scope;
    } {
      return {
        getScope(): any {
          return {
            getTransaction: () => {
              return returnUndefinedTransaction ? undefined : testTransaction;
            },
          };
        },
      };
    },
  };
});

describe('Sentry.trackComponent()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    testTransaction.spans = [];

    testTransaction.startChild.mockImplementation(spanCtx => {
      testTransaction.spans.push(spanCtx);
      return testInitSpan;
    });

    testInitSpan.startChild.mockImplementation((spanCtx: any) => {
      testTransaction.spans.push(spanCtx);
      return testUpdateSpan;
    });

    testInitSpan.finish = jest.fn();
    testInitSpan.endTimestamp = undefined;
    returnUndefinedTransaction = false;
  });

  it('creates nested init and update spans on component initialization', () => {
    render(DummyComponent, { props: { options: {} } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy>',
      op: 'ui.svelte.init',
    });

    expect(testInitSpan.startChild).toHaveBeenCalledWith({
      description: '<Dummy>',
      op: 'ui.svelte.update',
    });

    expect(testInitSpan.finish).toHaveBeenCalledTimes(1);
    expect(testUpdateSpan.finish).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(2);
  });

  it('creates an update span, when the component is updated', async () => {
    // Make the finish() function actually end the initSpan
    testInitSpan.finish.mockImplementation(() => {
      testInitSpan.endTimestamp = new Date().getTime();
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
      description: '<Dummy>',
      op: 'ui.svelte.update',
    });
    expect(testTransaction.spans.length).toEqual(3);
  });

  it('only creates init spans if trackUpdates is deactivated', () => {
    render(DummyComponent, { props: { options: { trackUpdates: false } } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy>',
      op: 'ui.svelte.init',
    });

    expect(testInitSpan.startChild).not.toHaveBeenCalled();

    expect(testInitSpan.finish).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(1);
  });

  it('only creates update spans if trackInit is deactivated', () => {
    render(DummyComponent, { props: { options: { trackInit: false } } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy>',
      op: 'ui.svelte.update',
    });

    expect(testInitSpan.startChild).not.toHaveBeenCalled();

    expect(testInitSpan.finish).toHaveBeenCalledTimes(1);
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
    });

    expect(testInitSpan.startChild).toHaveBeenCalledWith({
      description: '<CustomComponentName>',
      op: 'ui.svelte.update',
    });

    expect(testInitSpan.finish).toHaveBeenCalledTimes(1);
    expect(testUpdateSpan.finish).toHaveBeenCalledTimes(1);
    expect(testTransaction.spans.length).toEqual(2);
  });

  it("doesn't do anything, if there's no ongoing transaction", async () => {
    returnUndefinedTransaction = true;

    render(DummyComponent, {
      props: { options: { componentName: 'CustomComponentName' } },
    });

    expect(testInitSpan.finish).toHaveBeenCalledTimes(0);
    expect(testUpdateSpan.finish).toHaveBeenCalledTimes(0);
    expect(testTransaction.spans.length).toEqual(0);
  });

  it("doesn't record update spans, if there's no ongoing transaction at that time", async () => {
    // Make the finish() function actually end the initSpan
    testInitSpan.finish.mockImplementation(() => {
      testInitSpan.endTimestamp = new Date().getTime();
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
      description: '<Dummy>',
      op: 'ui.svelte.init',
    });
    expect(testTransaction.spans.length).toEqual(2);
  });
});
