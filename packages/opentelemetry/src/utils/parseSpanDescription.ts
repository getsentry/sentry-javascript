import type { Attributes } from '@opentelemetry/api';
import {
  DB_SYSTEM,
  DB_SYSTEM_NAME,
  FAAS_TRIGGER,
  HTTP_METHOD,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  HTTP_TARGET,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  RPC_SERVICE,
  SENTRY_KIND,
  URL_FRAGMENT,
  URL_FULL,
  URL_QUERY,
} from '@sentry/conventions/attributes';
import {
  GENERAL_FUNCTION_SPAN_OP,
  MESSAGING_QUEUE_PROCESS_SPAN_OP,
  MESSAGING_QUEUE_PUBLISH_SPAN_OP,
  MESSAGING_QUEUE_RECEIVE_SPAN_OP,
  MESSAGING_QUEUE_SPAN_OP,
  WEB_SERVER_HTTP_SERVER_SPAN_OP,
} from '@sentry/conventions/op';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  getSanitizedUrlString,
  getUrlFragment,
  getUrlQuery,
  parseUrl,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  stripUrlQueryAndFragment,
} from '@sentry/core';

interface SpanDescription {
  op: string | undefined;
  data?: Record<string, string | undefined>;
}

/**
 * Infer the op & description for a set of name, attributes and kind of a span.
 */
export function inferSpanData(attributes: SpanAttributes): SpanDescription {
  // if http.method exists, this is an http request span
  // eslint-disable-next-line typescript/no-deprecated
  const httpMethod = attributes[HTTP_REQUEST_METHOD] || attributes[HTTP_METHOD];
  if (httpMethod) {
    return descriptionForHttpMethod(attributes);
  }

  // eslint-disable-next-line typescript/no-deprecated
  const dbSystem = attributes[DB_SYSTEM_NAME] || attributes[DB_SYSTEM];
  const opIsCache =
    typeof attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'string' &&
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP].startsWith('cache.');

  // If db.type exists then this is a database call span
  // If the Redis DB is used as a cache, the span description should not be changed
  if (dbSystem && !opIsCache) {
    return descriptionForDbSystem(attributes);
  }

  // If rpc.service exists then this is a rpc call span.
  // eslint-disable-next-line typescript/no-deprecated
  const rpcService = attributes[RPC_SERVICE];
  if (rpcService) {
    return {
      op: 'rpc',
    };
  }

  // If messaging.system exists then this is a messaging system span.
  // Derive the queue op from the messaging operation type.
  const messagingSystem = attributes[MESSAGING_SYSTEM];
  if (messagingSystem) {
    return {
      op: getMessagingOp(attributes[MESSAGING_OPERATION_TYPE]),
    };
  }

  // If faas.trigger exists then this is a function as a service span.
  const faasTrigger = attributes[FAAS_TRIGGER];
  if (faasTrigger) {
    return {
      op: getFaasOp(faasTrigger),
    };
  }

  return { op: undefined };
}

/**
 * Maps an OTel `faas.trigger` to a registered span op. `http` triggers are inbound HTTP requests and
 * `pubsub` triggers process queued messages; everything else (`timer`, `datasource`, `other`, or any
 * non-conformant value) is a plain function invocation.
 */
function getFaasOp(trigger: unknown): string {
  switch (trigger) {
    case 'http':
      return WEB_SERVER_HTTP_SERVER_SPAN_OP;
    case 'pubsub':
      return MESSAGING_QUEUE_PROCESS_SPAN_OP;
    default:
      return GENERAL_FUNCTION_SPAN_OP;
  }
}

/**
 * Maps an OTel `messaging.operation.type` to the corresponding `queue.*` span op. `send` is the
 * pre-1.0 spelling of `publish`; both map to `queue.publish`. Unknown or missing types fall back to
 * the generic `queue` op.
 */
function getMessagingOp(operationType: unknown): string {
  switch (operationType) {
    case 'publish':
    case 'send':
      return MESSAGING_QUEUE_PUBLISH_SPAN_OP;
    case 'receive':
      return MESSAGING_QUEUE_RECEIVE_SPAN_OP;
    case 'process':
      return MESSAGING_QUEUE_PROCESS_SPAN_OP;
    default:
      return MESSAGING_QUEUE_SPAN_OP;
  }
}

/**
 * Extract better op/description from an otel span.
 *
 * Does not overwrite the span name if the source is already set to custom to ensure
 * that user-updated span names are preserved. In this case, we only adjust the op but
 * leave span description and source unchanged.
 *
 * Based on https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/7422ce2a06337f68a59b552b8c5a2ac125d6bae5/exporter/sentryexporter/sentry_exporter.go#L306
 */
export function parseSpanDescription(span: Span): SpanDescription {
  const json = spanToJSON(span);
  const attributes = json.data;

  return inferSpanData(attributes);
}

function descriptionForDbSystem(attributes: Attributes): SpanDescription {
  // if we already have a custom name, we don't overwrite it but only set the op
  const userDefinedName = attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
  if (typeof userDefinedName === 'string') {
    return {
      op: 'db',
    };
  }

  // if we already have the source set to custom, we don't overwrite the span description but only set the op
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom') {
    return { op: 'db' };
  }

  return { op: 'db' };
}

/** Only exported for tests. */
export function descriptionForHttpMethod(attributes: Attributes): SpanDescription {
  const opParts = ['http'];
  const kind = attributes[SENTRY_KIND];

  switch (kind) {
    case 'client':
      opParts.push('client');
      break;
    case 'server':
      opParts.push('server');
      break;
  }

  // Spans for HTTP requests we have determined to be prefetch requests will have a `.prefetch` postfix in the op
  if (attributes['sentry.http.prefetch']) {
    opParts.push('prefetch');
  }

  const { urlPath, url, query, fragment } = getSanitizedUrl(attributes);

  if (!urlPath) {
    return { op: opParts.join('.') };
  }

  const data: Record<string, string> = {};

  if (url) {
    data[URL_FULL] = url;
  }
  const urlQuery = getUrlQuery(query);
  if (urlQuery) {
    data[URL_QUERY] = urlQuery;
  }
  const urlFragment = getUrlFragment(fragment);
  if (urlFragment) {
    data[URL_FRAGMENT] = urlFragment;
  }

  return {
    op: opParts.join('.'),
    data,
  };
}

/** Exported for tests only */
export function getSanitizedUrl(attributes: Attributes): {
  url: string | undefined;
  urlPath: string | undefined;
  query: string | undefined;
  fragment: string | undefined;
  hasRoute: boolean;
} {
  const kind = attributes[SENTRY_KIND];

  // This is the relative path of the URL, e.g. /sub
  // eslint-disable-next-line typescript/no-deprecated
  const httpTarget = attributes[HTTP_TARGET];
  // This is the full URL, including host & query params etc., e.g. https://example.com/sub?foo=bar
  const httpUrl = attributes[URL_FULL];
  // This is the normalized route name - may not always be available!
  const httpRoute = attributes[HTTP_ROUTE];

  const parsedUrl = typeof httpUrl === 'string' ? parseUrl(httpUrl) : undefined;
  const url = parsedUrl ? getSanitizedUrlString(parsedUrl) : undefined;
  const query = parsedUrl?.search || undefined;
  const fragment = parsedUrl?.hash || undefined;

  if (typeof httpRoute === 'string') {
    return { urlPath: httpRoute, url, query, fragment, hasRoute: true };
  }

  if (kind === 'server' && typeof httpTarget === 'string') {
    return { urlPath: stripUrlQueryAndFragment(httpTarget), url, query, fragment, hasRoute: false };
  }

  if (parsedUrl) {
    return { urlPath: url, url, query, fragment, hasRoute: false };
  }

  // fall back to target even for client spans, if no URL is present
  if (typeof httpTarget === 'string') {
    return { urlPath: stripUrlQueryAndFragment(httpTarget), url, query, fragment, hasRoute: false };
  }

  return { urlPath: undefined, url, query, fragment, hasRoute: false };
}
