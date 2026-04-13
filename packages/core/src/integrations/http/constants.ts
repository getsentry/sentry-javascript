export const LOG_PREFIX = '@sentry/instrumentation-http';
export const HTTP_ON_REQUEST_CREATED = 'http.client.request.created';
export const HTTP_ON_RESPONSE_FINISH = 'http.client.response.finish';
export const HTTP_ON_REQUEST_ERROR = 'http.client.request.error';
export const HTTP_ON_SERVER_REQUEST = 'http.server.request.start';
export type ClientSubscriptionName = typeof HTTP_ON_RESPONSE_FINISH | typeof HTTP_ON_REQUEST_ERROR | typeof HTTP_ON_REQUEST_CREATED;
export type ServerSubscriptionName = typeof HTTP_ON_SERVER_REQUEST;
