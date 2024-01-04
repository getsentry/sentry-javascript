const origSentry = jest.requireActual('@sentry/node');
export const defaultIntegrations = origSentry.defaultIntegrations; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const Handlers = origSentry.Handlers; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const Integrations = origSentry.Integrations;
export const addRequestDataToEvent = origSentry.addRequestDataToEvent;
export const SDK_VERSION = '6.6.6';
export const Severity = {
  Warning: 'warning',
};
export const continueTrace = origSentry.continueTrace;

export const fakeScope = {
  addEventProcessor: jest.fn(),
  setTransactionName: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  setSpan: jest.fn(),
  getTransaction: jest.fn(() => fakeTransaction),
  setSDKProcessingMetadata: jest.fn(),
  setPropagationContext: jest.fn(),
};
export const fakeSpan = {
  end: jest.fn(),
  setHttpStatus: jest.fn(),
};
export const fakeTransaction = {
  end: jest.fn(),
  setHttpStatus: jest.fn(),
  startChild: jest.fn(() => fakeSpan),
};
export const init = jest.fn();
export const addGlobalEventProcessor = jest.fn();
export const getCurrentScope = jest.fn(() => fakeScope);
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const withScope = jest.fn(cb => cb(fakeScope));
export const flush = jest.fn(() => Promise.resolve());
export const getClient = jest.fn(() => ({}));
export const startSpanManual = jest.fn((ctx, callback: (span: any) => any) => callback(fakeSpan));

export const resetMocks = (): void => {
  fakeTransaction.setHttpStatus.mockClear();
  fakeTransaction.end.mockClear();
  fakeTransaction.startChild.mockClear();
  fakeSpan.end.mockClear();
  fakeSpan.setHttpStatus.mockClear();

  fakeScope.addEventProcessor.mockClear();
  fakeScope.setTransactionName.mockClear();
  fakeScope.setTag.mockClear();
  fakeScope.setContext.mockClear();
  fakeScope.setSpan.mockClear();
  fakeScope.getTransaction.mockClear();

  init.mockClear();
  addGlobalEventProcessor.mockClear();

  captureException.mockClear();
  captureMessage.mockClear();
  withScope.mockClear();
  flush.mockClear();
  getClient.mockClear();
  startSpanManual.mockClear();
};
