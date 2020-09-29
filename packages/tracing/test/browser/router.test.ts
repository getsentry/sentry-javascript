import { JSDOM } from 'jsdom';

import { defaultRoutingInstrumentation } from '../../src/browser/router';

let mockChangeHistory: ({ to, from }: { to: string; from?: string }) => void = () => undefined;
let addInstrumentationHandlerType: string = '';
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: ({ callback, type }: any): void => {
      addInstrumentationHandlerType = type;
      mockChangeHistory = callback;
    },
  };
});

describe('defaultRoutingInstrumentation', () => {
  const mockFinish = jest.fn();
  const startTransaction = jest.fn().mockReturnValue({ finish: mockFinish });
  beforeEach(() => {
    const dom = new JSDOM();
    // @ts-ignore need to override global document
    global.document = dom.window.document;
    // @ts-ignore need to override global document
    global.window = dom.window;
    // @ts-ignore need to override global document
    global.location = dom.window.location;

    startTransaction.mockClear();
    mockFinish.mockClear();
  });

  it('does not start transactions if global location is undefined', () => {
    // @ts-ignore need to override global document
    global.location = undefined;
    defaultRoutingInstrumentation(startTransaction);
    expect(startTransaction).toHaveBeenCalledTimes(0);
  });

  it('starts a pageload transaction', () => {
    defaultRoutingInstrumentation(startTransaction);
    expect(startTransaction).toHaveBeenCalledTimes(1);
    expect(startTransaction).toHaveBeenLastCalledWith({ name: 'blank', op: 'pageload' });
  });

  it('does not start a pageload transaction if startTransactionOnPageLoad is false', () => {
    defaultRoutingInstrumentation(startTransaction, false);
    expect(startTransaction).toHaveBeenCalledTimes(0);
  });

  describe('navigation transaction', () => {
    beforeEach(() => {
      mockChangeHistory = () => undefined;
      addInstrumentationHandlerType = '';
    });

    it('it is not created automatically', () => {
      defaultRoutingInstrumentation(startTransaction);
      expect(startTransaction).not.toHaveBeenLastCalledWith({ name: 'blank', op: 'navigation' });
    });

    it('is created on location change', () => {
      defaultRoutingInstrumentation(startTransaction);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(addInstrumentationHandlerType).toBe('history');

      expect(startTransaction).toHaveBeenCalledTimes(2);
      expect(startTransaction).toHaveBeenLastCalledWith({ name: 'blank', op: 'navigation' });
    });

    it('is not created if startTransactionOnLocationChange is false', () => {
      defaultRoutingInstrumentation(startTransaction, true, false);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(addInstrumentationHandlerType).toBe('');

      expect(startTransaction).toHaveBeenCalledTimes(1);
    });

    it('finishes the last active transaction', () => {
      defaultRoutingInstrumentation(startTransaction);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });

    it('will finish active transaction multiple times', () => {
      defaultRoutingInstrumentation(startTransaction);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(mockFinish).toHaveBeenCalledTimes(1);
      mockChangeHistory({ to: 'over/there', from: 'here' });
      expect(mockFinish).toHaveBeenCalledTimes(2);
      mockChangeHistory({ to: 'nowhere', from: 'over/there' });
      expect(mockFinish).toHaveBeenCalledTimes(3);
    });

    it('not created if `from` is equal to `to`', () => {
      defaultRoutingInstrumentation(startTransaction);
      mockChangeHistory({ to: 'first/path', from: 'first/path' });
      expect(addInstrumentationHandlerType).toBe('history');

      expect(startTransaction).toHaveBeenCalledTimes(1);
      expect(startTransaction).not.toHaveBeenLastCalledWith('navigation');
    });
  });
});
