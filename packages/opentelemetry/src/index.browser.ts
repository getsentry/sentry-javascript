export * from './exports';

// This is the generic, non-node specific async context strategy
export { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';

export type AsyncLocalStorageLookup = {
  asyncLocalStorage: unknown;
  contextSymbol: symbol;
};
