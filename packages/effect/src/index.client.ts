// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/browser';

export { layer, init } from './client/index';
export type { EffectClientLayerOptions } from './client/index';

export { Tracer } from './client/tracer';
export { externalSpanLayer } from './tracer';
export { Logger } from './logger';
export { metricsLayer } from './metrics';
