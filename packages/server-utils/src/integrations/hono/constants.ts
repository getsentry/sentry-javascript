// Origin for the `http.server` child span that traces Hono's internal `app.request(...)` dispatches.
// Shared by the `app.request` Proxy (`patchAppRequest`) and the orchestrion channel subscriber
// (`instrumentInternalRequests` in `honoIntegration`), which both open this span.
export const INTERNAL_REQUEST_ORIGIN = 'auto.http.hono.internal_request';

// Marks the Sentry request/response middleware so the span-wrapping patches never turn it into a
// middleware span — most importantly when an auto-instrumented sub-app carrying this middleware is
// mounted into a parent and `wrapSubAppMiddleware` wraps its handlers. Read by `wrapMiddlewareWithSpan`
// and `resolveRouteName`.
export const SENTRY_HONO_MIDDLEWARE = '__SENTRY_HONO_MIDDLEWARE__';
