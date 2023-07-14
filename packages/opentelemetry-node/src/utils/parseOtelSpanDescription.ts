import type { Attributes, AttributeValue } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { TransactionSource } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';

interface SpanDescription {
  op: string | undefined;
  description: string;
  source: TransactionSource;
}

/**
 * Extract better op/description from an otel span.
 *
 * Based on https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/7422ce2a06337f68a59b552b8c5a2ac125d6bae5/exporter/sentryexporter/sentry_exporter.go#L306
 *
 * @param otelSpan
 * @returns Better op/description to use, or undefined
 */
export function parseSpanDescription(otelSpan: OtelSpan): SpanDescription {
  const { attributes, name } = otelSpan;

  // if http.method exists, this is an http request span
  const httpMethod = attributes[SemanticAttributes.HTTP_METHOD];
  if (httpMethod) {
    return descriptionForHttpMethod(otelSpan, httpMethod);
  }

  // If db.type exists then this is a database call span.
  const dbSystem = attributes[SemanticAttributes.DB_SYSTEM];
  if (dbSystem) {
    return descriptionForDbSystem(otelSpan, dbSystem);
  }

  // If rpc.service exists then this is a rpc call span.
  const rpcService = attributes[SemanticAttributes.RPC_SERVICE];
  if (rpcService) {
    return {
      op: 'rpc',
      description: name,
      source: 'route',
    };
  }

  // If messaging.system exists then this is a messaging system span.
  const messagingSystem = attributes[SemanticAttributes.MESSAGING_SYSTEM];
  if (messagingSystem) {
    return {
      op: 'message',
      description: name,
      source: 'route',
    };
  }

  // If faas.trigger exists then this is a function as a service span.
  const faasTrigger = attributes[SemanticAttributes.FAAS_TRIGGER];
  if (faasTrigger) {
    return { op: faasTrigger.toString(), description: name, source: 'route' };
  }

  return { op: undefined, description: name, source: 'custom' };
}

function descriptionForDbSystem(otelSpan: OtelSpan, _dbSystem: AttributeValue): SpanDescription {
  const { attributes, name } = otelSpan;

  // Use DB statement (Ex "SELECT * FROM table") if possible as description.
  const statement = attributes[SemanticAttributes.DB_STATEMENT];

  const description = statement ? statement.toString() : name;

  return { op: 'db', description, source: 'task' };
}

function descriptionForHttpMethod(otelSpan: OtelSpan, httpMethod: AttributeValue): SpanDescription {
  const { name, kind, attributes } = otelSpan;

  const opParts = ['http'];

  switch (kind) {
    case SpanKind.CLIENT:
      opParts.push('client');
      break;
    case SpanKind.SERVER:
      opParts.push('server');
      break;
  }

  const httpRoute = attributes[SemanticAttributes.HTTP_ROUTE];
  const url = getSanitizedUrl(attributes, kind);

  if (!url) {
    return { op: opParts.join('.'), description: name, source: 'custom' };
  }

  // Ex. description="GET /api/users".
  const description = `${httpMethod} ${url}`;

  // If `httpPath` is a root path, then we can categorize the transaction source as route.
  const source: TransactionSource = httpRoute || url === '/' ? 'route' : 'url';

  return { op: opParts.join('.'), description, source };
}

/** Exported for tests only */
export function getSanitizedUrl(attributes: Attributes, kind: SpanKind): string | undefined {
  // This is the relative path of the URL, e.g. /sub
  const httpTarget = attributes[SemanticAttributes.HTTP_TARGET];
  // This is the full URL, including host & query params etc., e.g. https://example.com/sub?foo=bar
  const httpUrl = attributes[SemanticAttributes.HTTP_URL];
  // This is the normalized route name - may not always be available!
  const httpRoute = attributes[SemanticAttributes.HTTP_ROUTE];

  if (typeof httpRoute === 'string') {
    return httpRoute;
  }

  if (kind === SpanKind.SERVER && typeof httpTarget === 'string') {
    return normalizeTarget(httpTarget);
  }

  if (typeof httpUrl === 'string') {
    const url = parseUrl(httpUrl);
    return getSanitizedUrlString(url);
  }

  // fall back to target even for client spans, if no URL is present
  if (typeof httpTarget === 'string') {
    return normalizeTarget(httpTarget);
  }

  return undefined;
}

// Remove trailing ? and # from the target
function normalizeTarget(httpTarget: string): string {
  return httpTarget.replace(/([?#].*)$/, '');
}
