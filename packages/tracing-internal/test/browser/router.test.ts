import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { HandlerDataHistory } from '@sentry/types';
import { JSDOM } from 'jsdom';
import { conditionalTest } from '../../../node/test/utils';

import { instrumentRoutingWithDefaults } from '../../src/browser/router';

let mockChangeHistory: undefined | ((data: HandlerDataHistory) => void);
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addHistoryInstrumentationHandler: (callback: (data: HandlerDataHistory) => void): void => {
      mockChangeHistory = callback;
    },
  };
});

conditionalTest({ min: 16 })('instrumentRoutingWithDefaults', () => {
  const mockFinish = jest.fn();
  const customStartTransaction = jest.fn().mockReturnValue({ end: mockFinish });
  beforeEach(() => {
    const dom = new JSDOM();
    // @ts-expect-error need to override global document
    global.document = dom.window.document;
    // @ts-expect-error need to override global document
    global.window = dom.window;
    // @ts-expect-error need to override global document
    global.location = dom.window.location;

    customStartTransaction.mockClear();
    mockFinish.mockClear();
  });

  it('does not start transactions if global location is undefined', () => {
    // @ts-expect-error need to override global document
    global.location = undefined;
    instrumentRoutingWithDefaults(customStartTransaction);
    expect(customStartTransaction).toHaveBeenCalledTimes(0);
  });

  it('starts a pageload transaction', () => {
    instrumentRoutingWithDefaults(customStartTransaction);
    expect(customStartTransaction).toHaveBeenCalledTimes(1);
    expect(customStartTransaction).toHaveBeenLastCalledWith({
      name: 'blank',
      op: 'pageload',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
      },
      startTimestamp: expect.any(Number),
    });
  });

  it('does not start a pageload transaction if startTransactionOnPageLoad is false', () => {
    instrumentRoutingWithDefaults(customStartTransaction, false);
    expect(customStartTransaction).toHaveBeenCalledTimes(0);
  });

  describe('navigation transaction', () => {
    beforeEach(() => {
      mockChangeHistory = undefined;
    });

    it('it is not created automatically', () => {
      instrumentRoutingWithDefaults(customStartTransaction);
      expect(customStartTransaction).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'navigation' }));
    });

    it('is created on location change', () => {
      instrumentRoutingWithDefaults(customStartTransaction);
      expect(mockChangeHistory).toBeDefined();
      mockChangeHistory!({ to: 'here', from: 'there' });

      expect(customStartTransaction).toHaveBeenCalledTimes(2);
      expect(customStartTransaction).toHaveBeenLastCalledWith({
        name: 'blank',
        op: 'navigation',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
        },
      });
    });

    it('is not created if startTransactionOnLocationChange is false', () => {
      instrumentRoutingWithDefaults(customStartTransaction, true, false);
      expect(mockChangeHistory).toBeUndefined();

      expect(customStartTransaction).toHaveBeenCalledTimes(1);
    });

    it('finishes the last active transaction', () => {
      instrumentRoutingWithDefaults(customStartTransaction);

      expect(mockChangeHistory).toBeDefined();

      expect(mockFinish).toHaveBeenCalledTimes(0);
      mockChangeHistory!({ to: 'here', from: 'there' });
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });

    it('will finish active transaction multiple times', () => {
      instrumentRoutingWithDefaults(customStartTransaction);

      expect(mockChangeHistory).toBeDefined();

      expect(mockFinish).toHaveBeenCalledTimes(0);
      mockChangeHistory!({ to: 'here', from: 'there' });
      expect(mockFinish).toHaveBeenCalledTimes(1);
      mockChangeHistory!({ to: 'over/there', from: 'here' });
      expect(mockFinish).toHaveBeenCalledTimes(2);
      mockChangeHistory!({ to: 'nowhere', from: 'over/there' });
      expect(mockFinish).toHaveBeenCalledTimes(3);
    });

    it('not created if `from` is equal to `to`', () => {
      instrumentRoutingWithDefaults(customStartTransaction);
      expect(mockChangeHistory).toBeDefined();
      mockChangeHistory!({ to: 'first/path', from: 'first/path' });

      expect(customStartTransaction).toHaveBeenCalledTimes(1);
      expect(customStartTransaction).not.toHaveBeenLastCalledWith('navigation');
    });
  });
});
