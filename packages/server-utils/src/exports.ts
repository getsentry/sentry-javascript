// Shared exports not using diagnostics channels
export { setHttpServerSpanRouteAttribute } from './utils/setHttpServerSpanRouteAttribute';
export { injectHtmlIntoHead, injectHtmlIntoHeadStream } from './utils/htmlInjection';
export { setAsyncLocalStorageAsyncContextStrategy } from './async-context';
export { otlpIntegration, getOtlpTracesEndpoint } from './otlp';
export * from './ai';
