const origSentry = jest.requireActual('@sentry/core');
export const BaseClient = origSentry.BaseClient;
export const Integrations = origSentry.Integrations;
export const getMainCarrier = origSentry.getMainCarrier;
export const captureException = jest.fn();
