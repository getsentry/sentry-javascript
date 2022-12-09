const origSentry = jest.requireActual('@sentry/node');
export const defaultIntegrations = origSentry.defaultIntegrations; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const Handlers = origSentry.Handlers; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
export const Integrations = origSentry.Integrations;
export const addRequestDataToEvent = origSentry.addRequestDataToEvent;
export const SDK_VERSION = '6.6.6';
export const Severity = {
  Warning: 'warning',
};
export const fakeHub = {
  configureScope: jest.fn((fn: (arg: any) => any) => fn(fakeScope)),
  pushScope: jest.fn(() => fakeScope),
  popScope: jest.fn(),
  getScope: jest.fn(() => fakeScope),
  startTransaction: jest.fn(context => ({ ...fakeTransaction, ...context })),
};
export const fakeScope = {
  addEventProcessor: jest.fn(),
  setTransactionName: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  setSpan: jest.fn(),
  getTransaction: jest.fn(() => fakeTransaction),
  setSDKProcessingMetadata: jest.fn(),
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
export const captureMessage = jest.fn();
export const withScope = jest.fn(cb => cb(fakeScope));
export const flush = jest.fn(() => Promise.resolve());
