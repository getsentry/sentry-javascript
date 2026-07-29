export * from './exports';

// Node-specific exports
export { type AsyncLocalStorageLookup } from './asyncLocalStorageContextManager';

// We export the node-specific variant here that uses async local storage
export { setNodeOpenTelemetryContextAsyncContextStrategy as setOpenTelemetryContextAsyncContextStrategy } from './nodeAsyncContextStrategy';
