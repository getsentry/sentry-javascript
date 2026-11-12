import {
  CLIENT_ADDRESS,
  FAAS_TRIGGER,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_ROUTE,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import type { Client, SpanAttributes } from '@sentry/core';
import { filterCollectedUrl, filterCollectedUrlQuery, isPlainObject } from '@sentry/core';
import { getClientIPAddress } from '@sentry/core/server';

type EventHeaders = Record<string, string | undefined>;

const DEFAULT_PORTS: Record<string, string | undefined> = { http: '80', https: '443' };

interface HttpEventLike {
  version?: string;
  httpMethod?: string;
  path?: string;
  rawPath?: string;
  rawQueryString?: string;
  resource?: string;
  routeKey?: string;
  headers?: EventHeaders | null;
  multiValueHeaders?: Record<string, string[] | undefined> | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  multiValueQueryStringParameters?: Record<string, string[] | undefined> | null;
  requestContext?: {
    domainName?: string;
    protocol?: string;
    elb?: unknown;
    identity?: { sourceIp?: string; userAgent?: string };
    http?: { method?: string; path?: string; protocol?: string; sourceIp?: string; userAgent?: string };
  };
}

/**
 * Builds the request attributes `http.server` spans have for invocations triggered by an HTTP event
 * (Lambda Function URLs, API Gateway REST and HTTP APIs, ALB).
 */
export function getHttpRequestAttributes(event: unknown, client: Client | undefined): SpanAttributes {
  const format = getPayloadFormat(event);
  if (!format) {
    return {};
  }

  const httpEvent = event as HttpEventLike;
  const isV2 = format === '2.0';
  const requestContext = httpEvent.requestContext || {};
  const headers = getHeaders(httpEvent);
  const { http, identity } = requestContext;
  const scheme = getHeader(headers, 'x-forwarded-proto');
  const forwardedPort = getHeader(headers, 'x-forwarded-port');
  const port = Number(forwardedPort);
  const path = isV2 ? httpEvent.rawPath || http?.path : httpEvent.path;
  const query = isV2 ? httpEvent.rawQueryString : getQueryFromParameters(httpEvent, !!requestContext.elb);
  // Like on `http.server` spans, a forwarding header wins: `sourceIp` is the address of whatever connected
  // to AWS, which is a proxy such as CloudFront when there is one in front.
  const clientAddress = client?.getDataCollectionOptions().userInfo
    ? getClientIPAddress(headers) || http?.sourceIp || identity?.sourceIp || undefined
    : undefined;

  return {
    [FAAS_TRIGGER]: 'http',
    [HTTP_REQUEST_METHOD]: (http?.method || httpEvent.httpMethod)?.toUpperCase(),
    [HTTP_ROUTE]: isV2 ? getPayloadFormatV2Route(httpEvent) : getPayloadFormatV1Route(httpEvent),
    [URL_FULL]: filterCollectedUrl(getFullUrl(scheme, getHeader(headers, 'host'), forwardedPort, path, query), client),
    [URL_PATH]: path,
    [URL_QUERY]: filterCollectedUrlQuery(query, client),
    [URL_SCHEME]: scheme,
    [SERVER_ADDRESS]: requestContext.domainName || getHeader(headers, 'host')?.replace(/:\d+$/, ''),
    [SERVER_PORT]: Number.isInteger(port) && port > 0 ? port : undefined,
    [CLIENT_ADDRESS]: clientAddress,
    [USER_AGENT_ORIGINAL]: http?.userAgent || identity?.userAgent || getHeader(headers, 'user-agent'),
    [NETWORK_PROTOCOL_NAME]: 'http',
    [NETWORK_PROTOCOL_VERSION]: (http?.protocol || requestContext.protocol)?.match(/^HTTP\/(.+)$/i)?.[1],
  };
}

/**
 * Builds the response attributes for an invocation triggered by an HTTP event, based on what the handler returned.
 */
export function getHttpResponseAttributes(event: unknown, result: unknown): SpanAttributes {
  const format = getPayloadFormat(event);
  if (!format) {
    return {};
  }

  const statusCode = isPlainObject(result) ? result.statusCode : undefined;
  if (statusCode != null) {
    // ALB also accepts the status code as a string.
    const code = Number(statusCode);
    return Number.isInteger(code) && code > 0 ? { [HTTP_RESPONSE_STATUS_CODE]: code } : {};
  }

  // For payload format 2.0 (Function URLs, HTTP APIs), Lambda answers with a 200 when the handler
  // returns anything without a `statusCode`. Format 1.0 requires one, so we can't infer it there.
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.response
  return format === '2.0' && result !== undefined ? { [HTTP_RESPONSE_STATUS_CODE]: 200 } : {};
}

// Payload format 1.0 is used by API Gateway REST APIs, HTTP APIs configured for it, and (in the same shape) ALB.
function getPayloadFormat(event: unknown): '1.0' | '2.0' | undefined {
  if (!isPlainObject(event)) {
    return undefined;
  }
  const httpEvent = event as HttpEventLike;
  if (httpEvent.version === '2.0' && typeof httpEvent.requestContext?.http?.method === 'string') {
    return '2.0';
  }
  return typeof httpEvent.httpMethod === 'string' ? '1.0' : undefined;
}

// `$default` is the catch-all route that Function URLs and HTTP API default stages use, not a route template.
function getPayloadFormatV2Route(event: HttpEventLike): string | undefined {
  return event.routeKey && event.routeKey !== '$default' ? event.routeKey.replace(/^\S+\s+/, '') : undefined;
}

// REST APIs send the route template (e.g. `/users/{id}`) as `resource`. HTTP APIs using payload format 1.0
// (which, unlike REST APIs, set `version`) send the request path there for their catch-all `$default` route,
// so we can't tell a template from a raw path. ALB events have no route.
function getPayloadFormatV1Route(event: HttpEventLike): string | undefined {
  return event.version === undefined ? event.resource : undefined;
}

// ALB passes query parameters as sent, API Gateway decodes them.
function getQueryFromParameters(event: HttpEventLike, isEncoded: boolean): string | undefined {
  const encode = isEncoded ? (value: string): string => value : encodeURIComponent;
  const pairs: string[] = [];

  if (event.multiValueQueryStringParameters) {
    for (const [key, values] of Object.entries(event.multiValueQueryStringParameters)) {
      for (const value of values || []) {
        pairs.push(`${encode(key)}=${encode(value)}`);
      }
    }
  } else if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      pairs.push(`${encode(key)}=${encode(value ?? '')}`);
    }
  }

  return pairs.length ? pairs.join('&') : undefined;
}

function getFullUrl(
  scheme: string | undefined,
  host: string | undefined,
  port: string | undefined,
  path: string | undefined,
  query: string | undefined,
): string | undefined {
  if (!scheme || !host || !path) {
    return undefined;
  }
  // Clients put non-default ports into the host header, which ALB passes through as is.
  const portSuffix = port && port !== DEFAULT_PORTS[scheme] && !/:\d+$/.test(host) ? `:${port}` : '';
  return `${scheme}://${host}${portSuffix}${path}${query ? `?${query}` : ''}`;
}

// ALB target groups with multi-value headers enabled send only `multiValueHeaders`.
function getHeaders(event: HttpEventLike): EventHeaders {
  const headers: EventHeaders = { ...event.headers };
  for (const [name, values] of Object.entries(event.multiValueHeaders || {})) {
    if (values?.length && getHeader(headers, name.toLowerCase()) === undefined) {
      headers[name] = values.join(', ');
    }
  }
  return headers;
}

function getHeader(headers: EventHeaders, name: string): string | undefined {
  for (const key in headers) {
    if (key.toLowerCase() === name) {
      return headers[key];
    }
  }
  return undefined;
}
