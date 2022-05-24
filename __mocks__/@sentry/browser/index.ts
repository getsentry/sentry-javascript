const captureEvent = jest.fn();
const getCurrentHub = jest.fn(() => ({
  captureEvent,
}));

const addGlobalEventProcessor = jest.fn();
const configureScope = jest.fn();

export { getCurrentHub, addGlobalEventProcessor, configureScope };
