// Origin for the `http.server` child span that traces Hono's internal `app.request(...)` dispatches.
// Shared by the `app.request` Proxy (`patchAppRequest`) and the orchestrion channel subscriber
// (`instrumentInternalRequests` in `honoIntegration`), which both open this span.
export const INTERNAL_REQUEST_ORIGIN = 'auto.http.hono.internal_request';
