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
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import type { Client, SpanAttributes } from '@sentry/core';
import { filterCollectedUrlQuery, isPlainObject } from '@sentry/core';
import { getClientIPAddress } from '@sentry/core/server';

type EventHeaders = Record<string, string | undefined>;

interface HttpEventLike {
  version?: string;
  httpMethod?: string;
  path?: string;
  rawPath?: string;
  rawQueryString?: string;
  resource?: string;
  routeKey?: string;
  headers?: EventHeaders;
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

interface HttpRequestInfo {
  method: string;
  path?: string;
  query?: string;
  route?: string;
  protocol?: string;
  sourceIp?: string;
  userAgent?: string;
  domainName?: string;
}

/**
 * Builds the request attributes `http.server` spans have for invocations triggered by an HTTP event
 * (Lambda Function URLs, API Gateway REST and HTTP APIs, ALB).
 */
export function getHttpRequestAttributes(event: unknown, client: Client | undefined): SpanAttributes {
  if (!isPlainObject(event)) {
    return {};
  }

  const request = getHttpRequestInfo(event);
  if (!request) {
    return {};
  }

  const headers = (event as HttpEventLike).headers || {};
  const port = Number(getHeader(headers, 'x-forwarded-port'));
  const clientAddress = client?.getDataCollectionOptions().userInfo
    ? request.sourceIp || getClientIPAddress(headers) || undefined
    : undefined;

  return {
    [FAAS_TRIGGER]: 'http',
    [HTTP_REQUEST_METHOD]: request.method,
    [HTTP_ROUTE]: request.route,
    [URL_PATH]: request.path,
    [URL_QUERY]: filterCollectedUrlQuery(request.query, client),
    [URL_SCHEME]: getHeader(headers, 'x-forwarded-proto'),
    [SERVER_ADDRESS]: request.domainName || getHeader(headers, 'host')?.replace(/:\d+$/, ''),
    [SERVER_PORT]: Number.isInteger(port) && port > 0 ? port : undefined,
    [CLIENT_ADDRESS]: clientAddress,
    [USER_AGENT_ORIGINAL]: request.userAgent || getHeader(headers, 'user-agent'),
    [NETWORK_PROTOCOL_NAME]: 'http',
    [NETWORK_PROTOCOL_VERSION]: request.protocol?.match(/^HTTP\/(.+)$/i)?.[1],
  };
}

/**
 * Builds the response attributes for an invocation triggered by an HTTP event, based on what the handler returned.
 */
export function getHttpResponseAttributes(event: unknown, result: unknown): SpanAttributes {
  if (!isPlainObject(event) || !getHttpRequestInfo(event)) {
    return {};
  }

  const statusCode = isPlainObject(result) ? result.statusCode : undefined;
  if (typeof statusCode === 'number') {
    return { [HTTP_RESPONSE_STATUS_CODE]: statusCode };
  }

  // For payload format 2.0 (Function URLs, HTTP APIs), Lambda answers with a 200 when the handler
  // returns anything without a `statusCode`. Format 1.0 requires one, so we can't infer it there.
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.response
  return isPayloadFormatV2(event) && result !== undefined ? { [HTTP_RESPONSE_STATUS_CODE]: 200 } : {};
}

function isPayloadFormatV2(event: HttpEventLike): boolean {
  return event.version === '2.0' && typeof event.requestContext?.http?.method === 'string';
}

function getHttpRequestInfo(event: HttpEventLike): HttpRequestInfo | undefined {
  if (isPayloadFormatV2(event)) {
    const http = event.requestContext?.http;
    return {
      method: http!.method!.toUpperCase(),
      path: event.rawPath || http?.path,
      query: event.rawQueryString,
      // `$default` is the catch-all route that Function URLs and HTTP API default stages use, not a route template.
      route: event.routeKey && event.routeKey !== '$default' ? event.routeKey.replace(/^\S+\s+/, '') : undefined,
      protocol: http?.protocol,
      sourceIp: http?.sourceIp,
      userAgent: http?.userAgent,
      domainName: event.requestContext?.domainName,
    };
  }

  // Payload format 1.0 (API Gateway REST APIs and HTTP APIs) and ALB events.
  if (typeof event.httpMethod === 'string') {
    return {
      method: event.httpMethod.toUpperCase(),
      path: event.path,
      query: getQueryFromParameters(event, !!event.requestContext?.elb),
      route: getPayloadFormatV1Route(event),
      protocol: event.requestContext?.protocol,
      sourceIp: event.requestContext?.identity?.sourceIp,
      userAgent: event.requestContext?.identity?.userAgent,
      domainName: event.requestContext?.domainName,
    };
  }

  return undefined;
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

function getHeader(headers: EventHeaders, name: string): string | undefined {
  for (const key in headers) {
    if (key.toLowerCase() === name) {
      return headers[key];
    }
  }
  return undefined;
}
