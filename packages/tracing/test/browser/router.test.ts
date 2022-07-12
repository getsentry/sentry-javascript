import { InstrumentHandlerCallback, InstrumentHandlerType } from '@sentry/utils';
import { JSDOM } from 'jsdom';

import { instrumentRoutingWithDefaults } from '../../src/browser/router';

let mockChangeHistory: ({ to, from }: { to: string; from?: string }) => void = () => undefined;
let addInstrumentationHandlerType: string = '';
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: (type: InstrumentHandlerType, callback: InstrumentHandlerCallback): void => {
      addInstrumentationHandlerType = type;
      mockChangeHistory = callback;
    },
  };
});

const DEFAULT_PAGE_URL = 'https://www.example.com/';

const dom = new JSDOM(undefined, { url: DEFAULT_PAGE_URL });

describe('instrumentRoutingWithDefaults', () => {
  const mockFinish = jest.fn();
  const customStartTransaction = jest.fn().mockReturnValue({ finish: mockFinish });
  beforeEach(() => {
    dom.reconfigure({ url: DEFAULT_PAGE_URL });
    // @ts-ignore need to override global document
    global.document = dom.window.document;
    // @ts-ignore need to override global document
    global.window = dom.window;
    // @ts-ignore need to override global document
    global.location = dom.window.location;

    customStartTransaction.mockClear();
    mockFinish.mockClear();
  });

  it('does not start transactions if global location is undefined', () => {
    // @ts-ignore need to override global document
    global.location = undefined;
    instrumentRoutingWithDefaults(customStartTransaction);
    expect(customStartTransaction).toHaveBeenCalledTimes(0);
  });

  it('starts a pageload transaction', () => {
    instrumentRoutingWithDefaults(customStartTransaction);
    expect(customStartTransaction).toHaveBeenCalledTimes(1);
    expect(customStartTransaction).toHaveBeenLastCalledWith({
      name: '/',
      op: 'pageload',
      metadata: { source: 'url' },
    });
  });

  it('does not start a pageload transaction if startTransactionOnPageLoad is false', () => {
    instrumentRoutingWithDefaults(customStartTransaction, false);
    expect(customStartTransaction).toHaveBeenCalledTimes(0);
  });

  it.each([
    ['https://example.com', '/', undefined],
    ['https://example.com/', '/', undefined],
    ['https://example.com/home', '/home', undefined],
    ['https://example.com/organization/some-org-slug', '/organization/some-org-slug', undefined],
    // numbers
    [
      'https://example.com/organization/01337',
      '/organization/{number}',
      { params: { 'number-1': '01337' }, originalPathname: '/organization/01337' },
    ],
    [
      'https://example.com/organization/01337/user/42',
      '/organization/{number}/user/{number}',
      { params: { 'number-1': '01337', 'number-2': '42' }, originalPathname: '/organization/01337/user/42' },
    ],
    [
      'https://example.com/organization/01337/user/42/',
      '/organization/{number}/user/{number}/',
      { params: { 'number-1': '01337', 'number-2': '42' }, originalPathname: '/organization/01337/user/42/' },
    ],
    // SHA
    [
      'https://example.com/organization/3da541559918a808c2402bba5012f6c60b27661c',
      '/organization/{sha1-hash}',
      {
        params: { 'sha1-hash-1': '3da541559918a808c2402bba5012f6c60b27661c' },
        originalPathname: '/organization/3da541559918a808c2402bba5012f6c60b27661c',
      },
    ],
    [
      'https://example.com/organization/3da541559918a808c2402bba5012f6c60b27661c/user/01ce26dc69094af9246ea7e7ce9970aff2b81cc9/',
      '/organization/{sha1-hash}/user/{sha1-hash}/',
      {
        params: {
          'sha1-hash-1': '3da541559918a808c2402bba5012f6c60b27661c',
          'sha1-hash-2': '01ce26dc69094af9246ea7e7ce9970aff2b81cc9',
        },
        originalPathname:
          '/organization/3da541559918a808c2402bba5012f6c60b27661c/user/01ce26dc69094af9246ea7e7ce9970aff2b81cc9/',
      },
    ],
    // MD
    [
      'https://example.com/organization/1bee69a46ba811185c194762abaeae90',
      '/organization/{md-hash}',
      {
        params: { 'md-hash-1': '1bee69a46ba811185c194762abaeae90' },
        originalPathname: '/organization/1bee69a46ba811185c194762abaeae90',
      },
    ],
    [
      'https://example.com/organization/1bee69a46ba811185c194762abaeae90/user/b86e130ce7028da59e672d56ad0113df/',
      '/organization/{md-hash}/user/{md-hash}/',
      {
        params: {
          'md-hash-1': '1bee69a46ba811185c194762abaeae90',
          'md-hash-2': 'b86e130ce7028da59e672d56ad0113df',
        },
        originalPathname: '/organization/1bee69a46ba811185c194762abaeae90/user/b86e130ce7028da59e672d56ad0113df/',
      },
    ],
    // UUID
    [
      'https://example.com/organization/7591173e-01c7-11ed-b939-0242ac120002',
      '/organization/{uuid}',
      {
        params: { 'uuid-1': '7591173e-01c7-11ed-b939-0242ac120002' },
        originalPathname: '/organization/7591173e-01c7-11ed-b939-0242ac120002',
      },
    ],
    [
      'https://example.com/organization/7591173e-01c7-11ed-b939-0242ac120002/user/908607df-e5cb-4cc4-b61a-d6a534c43ec7/',
      '/organization/{uuid}/user/{uuid}/',
      {
        params: {
          'uuid-1': '7591173e-01c7-11ed-b939-0242ac120002',
          'uuid-2': '908607df-e5cb-4cc4-b61a-d6a534c43ec7',
        },
        originalPathname:
          '/organization/7591173e-01c7-11ed-b939-0242ac120002/user/908607df-e5cb-4cc4-b61a-d6a534c43ec7/',
      },
    ],
    // mixed
    [
      'https://example.com/organization/0012301/user/908607df-e5cb-4cc4-b61a-d6a534c43ec7/setting/424242/value/1bee69a46ba811185c194762abaeae90',
      '/organization/{number}/user/{uuid}/setting/{number}/value/{md-hash}',
      {
        params: {
          'md-hash-1': '1bee69a46ba811185c194762abaeae90',
          'number-1': '0012301',
          'number-2': '424242',
          'uuid-1': '908607df-e5cb-4cc4-b61a-d6a534c43ec7',
        },
        originalPathname:
          '/organization/0012301/user/908607df-e5cb-4cc4-b61a-d6a534c43ec7/setting/424242/value/1bee69a46ba811185c194762abaeae90',
      },
    ],
  ])(
    'should start a transaction with parameterization (url = %s)',
    (simulatedUrl, expectedTransactionName, expectedTransactionData) => {
      dom.reconfigure({ url: simulatedUrl });
      instrumentRoutingWithDefaults(customStartTransaction);
      expect(customStartTransaction).toHaveBeenCalledTimes(1);
      expect(customStartTransaction).toHaveBeenLastCalledWith({
        name: expectedTransactionName,
        op: 'pageload',
        data: expectedTransactionData,
        metadata: { source: 'url' },
      });
    },
  );

  describe('navigation transaction', () => {
    beforeEach(() => {
      mockChangeHistory = () => undefined;
      addInstrumentationHandlerType = '';
    });

    it('it is not created automatically', () => {
      instrumentRoutingWithDefaults(customStartTransaction);
      expect(customStartTransaction).not.toHaveBeenLastCalledWith({
        name: '/',
        op: 'navigation',
        metadata: { source: 'url' },
      });
    });

    it('is created on location change', () => {
      instrumentRoutingWithDefaults(customStartTransaction);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(addInstrumentationHandlerType).toBe('history');

      expect(customStartTransaction).toHaveBeenCalledTimes(2);
      expect(customStartTransaction).toHaveBeenLastCalledWith({
        name: '/',
        op: 'navigation',
        metadata: { source: 'url' },
      });
    });

    it('is not created if startTransactionOnLocationChange is false', () => {
      instrumentRoutingWithDefaults(customStartTransaction, true, false);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(addInstrumentationHandlerType).toBe('');

      expect(customStartTransaction).toHaveBeenCalledTimes(1);
    });

    it('finishes the last active transaction', () => {
      instrumentRoutingWithDefaults(customStartTransaction);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });

    it('will finish active transaction multiple times', () => {
      instrumentRoutingWithDefaults(customStartTransaction);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      mockChangeHistory({ to: 'here', from: 'there' });
      expect(mockFinish).toHaveBeenCalledTimes(1);
      mockChangeHistory({ to: 'over/there', from: 'here' });
      expect(mockFinish).toHaveBeenCalledTimes(2);
      mockChangeHistory({ to: 'nowhere', from: 'over/there' });
      expect(mockFinish).toHaveBeenCalledTimes(3);
    });

    it('not created if `from` is equal to `to`', () => {
      instrumentRoutingWithDefaults(customStartTransaction);
      mockChangeHistory({ to: 'first/path', from: 'first/path' });
      expect(addInstrumentationHandlerType).toBe('history');

      expect(customStartTransaction).toHaveBeenCalledTimes(1);
      expect(customStartTransaction).not.toHaveBeenLastCalledWith('navigation');
    });
  });
});
