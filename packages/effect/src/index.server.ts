// Server-side exports - uses @sentry/node-core/light for distributed tracing via diagnostics_channel
export * from '@sentry/node-core/light';

export { effectLayer } from './server/index';
export type { EffectServerLayerOptions, EffectLayerOptions } from './server/index';
