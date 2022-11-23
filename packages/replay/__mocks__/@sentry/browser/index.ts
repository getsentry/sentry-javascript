const captureEvent = jest.fn();
const getCurrentHub = jest.fn(() => ({
  captureEvent,
  getClient: jest.fn(() => ({
    getDsn: jest.fn(),
  })),
}));

const addGlobalEventProcessor = jest.fn();
const configureScope = jest.fn();

export { getCurrentHub, addGlobalEventProcessor, configureScope };
