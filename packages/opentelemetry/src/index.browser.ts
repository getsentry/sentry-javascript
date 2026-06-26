import { consoleSandbox } from '@sentry/core';

export * from './exports';

// Stubs for node-specific exports
export class SentryAsyncLocalStorageContextManager {
  public constructor() {
    consoleSandbox(() => {
      // oxlint-disable-next-line no-console
      console.error('SentryAsyncLocalStorageContextManager is not supported in the browser');
    });
  }
}

// This is the generic, non-node specific async context strategy
export { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';

export type AsyncLocalStorageLookup = {
  asyncLocalStorage: unknown;
  contextSymbol: symbol;
};
