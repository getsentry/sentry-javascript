export const SDK_VERSION = '6.6.6';
export const Severity = {
  Warning: 'warning',
};
export const fakeScope = {
  addEventProcessor: jest.fn(),
  setTransactionName: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
};
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const withScope = jest.fn(cb => cb(fakeScope));
export const flush = jest.fn(() => Promise.resolve());

export const resetMocks = (): void => {
  fakeScope.addEventProcessor.mockClear();
  fakeScope.setTransactionName.mockClear();
  fakeScope.setTag.mockClear();
  fakeScope.setContext.mockClear();

  captureException.mockClear();
  captureMessage.mockClear();
  withScope.mockClear();
  flush.mockClear();
};
