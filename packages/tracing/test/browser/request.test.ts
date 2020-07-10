import { registerRequestInstrumentation } from '../../src/browser/request';

const mockAddInstrumentationHandler = jest.fn();
let mockFetchCallback = jest.fn();
let mockXHRCallback = jest.fn();
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: ({ callback, type }: any) => {
      if (type === 'fetch') {
        mockFetchCallback = jest.fn(callback);
      }
      if (type === 'xhr') {
        mockXHRCallback = jest.fn(callback);
      }
      return mockAddInstrumentationHandler({ callback, type });
    },
  };
});

describe('registerRequestInstrumentation', () => {
  beforeEach(() => {
    mockFetchCallback.mockClear();
    mockXHRCallback.mockClear();
    mockAddInstrumentationHandler.mockClear();
  });

  it('tracks fetch and xhr requests', () => {
    registerRequestInstrumentation();
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(2);
    // fetch
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(1, { callback: expect.any(Function), type: 'fetch' });
    // xhr
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(2, { callback: expect.any(Function), type: 'xhr' });
  });

  it('does not add fetch requests spans if traceFetch is false', () => {
    registerRequestInstrumentation({ traceFetch: false });
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockFetchCallback()).toBe(undefined);
  });

  it('does not add xhr requests spans if traceXHR is false', () => {
    registerRequestInstrumentation({ traceXHR: false });
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockXHRCallback()).toBe(undefined);
  });
});
