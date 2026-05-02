// Bun light-specific exports (override node-core/light equivalents)
export { getDefaultIntegrations, init, initWithoutDefaultIntegrations } from './sdk';
export { makeFetchTransport } from '../transports';

// Re-export everything from @sentry/node-core/light.
// Note: explicit exports above take precedence over the wildcard re-export below,
// so our Bun-specific init/getDefaultIntegrations override the node-core ones.
export * from '@sentry/node-core/light';
