// These App-Router instrumentation wrappers transitively import `./utils/responseEnd` (its
// `flush`/`waitUntil` server-flush chain). They wrap server-only primitives (server components,
// route handlers, middleware, generation functions, server actions, `onRequestError`) that are
// never used from browser code, so they are kept out of the shared `common` barrel and re-exported
// only from the server and edge entrypoints — never from the client entry's `export * from
// '../common'`, which would pull them (and their server-only dependencies) into the browser bundle.
export { captureRequestError } from './captureRequestError';
export { wrapServerComponentWithSentry } from './wrapServerComponentWithSentry';
export { wrapRouteHandlerWithSentry } from './wrapRouteHandlerWithSentry';
export { wrapMiddlewareWithSentry } from './wrapMiddlewareWithSentry';
export { wrapGenerationFunctionWithSentry } from './wrapGenerationFunctionWithSentry';
export { withServerActionInstrumentation } from './withServerActionInstrumentation';
