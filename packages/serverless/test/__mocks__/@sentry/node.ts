const origSentry = jest.requireActual('@sentry/node');
export const Handlers = origSentry.Handlers; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const SDK_VERSION = '6.6.6';
export const Severity = {
  Warning: 'warning',
};
export const fakeParentScope = {
  setSpan: jest.fn(),
};
export const fakeHub = {
  configureScope: jest.fn((fn: (arg: any) => any) => fn(fakeParentScope)),
};
export const fakeScope = {
  addEventProcessor: jest.fn(),
  setTransactionName: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
};
export const fakeTransaction = {
  finish: jest.fn(),
  setHttpStatus: jest.fn(),
};
export const getCurrentHub = jest.fn(() => fakeHub);
export const startTransaction = jest.fn(_ => fakeTransaction);
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const withScope = jest.fn(cb => cb(fakeScope));
export const flush = jest.fn(() => Promise.resolve());

export const resetMocks = (): void => {
  fakeTransaction.setHttpStatus.mockClear();
  fakeTransaction.finish.mockClear();
  fakeParentScope.setSpan.mockClear();
  fakeHub.configureScope.mockClear();

  fakeScope.addEventProcessor.mockClear();
  fakeScope.setTransactionName.mockClear();
  fakeScope.setTag.mockClear();
  fakeScope.setContext.mockClear();

  getCurrentHub.mockClear();
  startTransaction.mockClear();
  captureException.mockClear();
  captureMessage.mockClear();
  withScope.mockClear();
  flush.mockClear();
};
