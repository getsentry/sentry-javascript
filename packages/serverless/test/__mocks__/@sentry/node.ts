const origSentry = jest.requireActual('@sentry/node');
export const defaultIntegrations = origSentry.defaultIntegrations; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const Handlers = origSentry.Handlers; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const SDK_VERSION = '6.6.6';
export const Severity = {
  Warning: 'warning',
};
export const fakeHub = {
  configureScope: jest.fn((fn: (arg: any) => any) => fn(fakeScope)),
  pushScope: jest.fn(() => fakeScope),
  popScope: jest.fn(),
  getScope: jest.fn(() => fakeScope),
};
export const fakeScope = {
  addEventProcessor: jest.fn(),
  setTransactionName: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  setSpan: jest.fn(),
  getTransaction: jest.fn(() => fakeTransaction),
};
export const fakeSpan = {
  finish: jest.fn(),
};
export const fakeTransaction = {
  finish: jest.fn(),
  setHttpStatus: jest.fn(),
  startChild: jest.fn(() => fakeSpan),
};
export const init = jest.fn();
export const addGlobalEventProcessor = jest.fn();
export const getCurrentHub = jest.fn(() => fakeHub);
export const startTransaction = jest.fn(_ => fakeTransaction);
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const withScope = jest.fn(cb => cb(fakeScope));
export const flush = jest.fn(() => Promise.resolve());

export const resetMocks = (): void => {
  fakeTransaction.setHttpStatus.mockClear();
  fakeTransaction.finish.mockClear();
  fakeTransaction.startChild.mockClear();
  fakeSpan.finish.mockClear();
  fakeHub.configureScope.mockClear();
  fakeHub.pushScope.mockClear();
  fakeHub.popScope.mockClear();
  fakeHub.getScope.mockClear();

  fakeScope.addEventProcessor.mockClear();
  fakeScope.setTransactionName.mockClear();
  fakeScope.setTag.mockClear();
  fakeScope.setContext.mockClear();
  fakeScope.setSpan.mockClear();
  fakeScope.getTransaction.mockClear();

  init.mockClear();
  addGlobalEventProcessor.mockClear();
  getCurrentHub.mockClear();
  startTransaction.mockClear();
  captureException.mockClear();
  captureMessage.mockClear();
  withScope.mockClear();
  flush.mockClear();
};
