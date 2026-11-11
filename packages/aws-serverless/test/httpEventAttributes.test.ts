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
import type { Client } from '@sentry/core';
import { describe, expect, test } from 'vitest';
import { getHttpRequestAttributes, getHttpResponseAttributes } from '../src/httpEventAttributes';

function makeClient(userInfo: boolean): Client {
  return {
    getDataCollectionOptions: () => ({ userInfo, urlQueryParams: true }),
  } as unknown as Client;
}

// https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html#urls-payloads
const functionUrlEvent = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/favicon.ico',
  rawQueryString: 'size=32&theme=dark',
  headers: {
    host: 'abc123.lambda-url.us-east-1.on.aws',
    'user-agent': 'Mozilla/5.0',
    'x-forwarded-for': '198.51.100.7',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  },
  requestContext: {
    domainName: 'abc123.lambda-url.us-east-1.on.aws',
    http: {
      method: 'GET',
      path: '/favicon.ico',
      protocol: 'HTTP/1.1',
      sourceIp: '198.51.100.7',
      userAgent: 'Mozilla/5.0',
    },
    routeKey: '$default',
  },
  isBase64Encoded: false,
};

const httpApiV2Event = {
  ...functionUrlEvent,
  routeKey: 'GET /users/{id}',
  rawPath: '/users/123',
  rawQueryString: '',
  requestContext: {
    ...functionUrlEvent.requestContext,
    domainName: 'api.example.com',
    http: { ...functionUrlEvent.requestContext.http, path: '/users/123' },
    routeKey: 'GET /users/{id}',
  },
};

const restApiEvent = {
  resource: '/users/{id}',
  path: '/users/123',
  httpMethod: 'POST',
  headers: {
    Host: 'abc123.execute-api.us-east-1.amazonaws.com',
    'User-Agent': 'curl/8.0',
    'X-Forwarded-Port': '443',
    'X-Forwarded-Proto': 'https',
  },
  queryStringParameters: { tag: 'b', q: 'a b' },
  multiValueQueryStringParameters: { tag: ['a', 'b'], q: ['a b'] },
  requestContext: {
    domainName: 'abc123.execute-api.us-east-1.amazonaws.com',
    protocol: 'HTTP/1.1',
    resourcePath: '/users/{id}',
    identity: { sourceIp: '203.0.113.9', userAgent: 'curl/8.0' },
  },
};

const httpApiV1Event = {
  version: '1.0',
  resource: '/users/123',
  path: '/users/123',
  httpMethod: 'GET',
  headers: { host: 'api.example.com', 'x-forwarded-proto': 'https' },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  requestContext: {
    domainName: 'api.example.com',
    protocol: 'HTTP/1.1',
    resourcePath: '/users/123',
    identity: { sourceIp: '203.0.113.9' },
  },
};

const albEvent = {
  httpMethod: 'GET',
  path: '/search',
  queryStringParameters: { q: 'a%20b' },
  headers: {
    host: 'my-alb-123.us-east-1.elb.amazonaws.com:8080',
    'user-agent': 'curl/8.0',
    'x-forwarded-for': '192.0.2.44',
    'x-forwarded-port': '8080',
    'x-forwarded-proto': 'http',
  },
  requestContext: { elb: { targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/tg/1' } },
  isBase64Encoded: false,
};

describe('getHttpRequestAttributes', () => {
  test('sets HTTP attributes for a Function URL event', () => {
    expect(getHttpRequestAttributes(functionUrlEvent, makeClient(true))).toEqual({
      [FAAS_TRIGGER]: 'http',
      [HTTP_REQUEST_METHOD]: 'GET',
      [HTTP_ROUTE]: undefined,
      [URL_PATH]: '/favicon.ico',
      [URL_QUERY]: 'size=32&theme=dark',
      [URL_SCHEME]: 'https',
      [SERVER_ADDRESS]: 'abc123.lambda-url.us-east-1.on.aws',
      [SERVER_PORT]: 443,
      [CLIENT_ADDRESS]: '198.51.100.7',
      [URL_FULL]: 'https://abc123.lambda-url.us-east-1.on.aws/favicon.ico?size=32&theme=dark',
      [USER_AGENT_ORIGINAL]: 'Mozilla/5.0',
      [NETWORK_PROTOCOL_NAME]: 'http',
      [NETWORK_PROTOCOL_VERSION]: '1.1',
    });
  });

  test('handles null headers', () => {
    expect(getHttpRequestAttributes({ ...restApiEvent, headers: null }, makeClient(true))).toMatchObject({
      [HTTP_REQUEST_METHOD]: 'POST',
      [URL_SCHEME]: undefined,
      [CLIENT_ADDRESS]: '203.0.113.9',
    });
    expect(getHttpRequestAttributes({ ...albEvent, headers: null }, makeClient(true))[CLIENT_ADDRESS]).toBeUndefined();
  });

  test('prefers a forwarded client address over the source IP', () => {
    const event = {
      ...restApiEvent,
      headers: { ...restApiEvent.headers, 'X-Forwarded-For': '198.51.100.20, 130.176.0.1' },
      requestContext: { ...restApiEvent.requestContext, identity: { sourceIp: '130.176.0.1' } },
    };
    expect(getHttpRequestAttributes(event, makeClient(true))[CLIENT_ADDRESS]).toBe('198.51.100.20');
  });

  test('omits client.address when user info is not collected', () => {
    expect(getHttpRequestAttributes(functionUrlEvent, makeClient(false))[CLIENT_ADDRESS]).toBeUndefined();
    expect(getHttpRequestAttributes(functionUrlEvent, undefined)[CLIENT_ADDRESS]).toBeUndefined();
  });

  test('takes the route template from an HTTP API route key', () => {
    expect(getHttpRequestAttributes(httpApiV2Event, makeClient(true))).toMatchObject({
      [HTTP_ROUTE]: '/users/{id}',
      [URL_PATH]: '/users/123',
      [URL_QUERY]: undefined,
      [SERVER_ADDRESS]: 'api.example.com',
    });
  });

  test('sets HTTP attributes for a REST API event', () => {
    expect(getHttpRequestAttributes(restApiEvent, makeClient(true))).toEqual({
      [FAAS_TRIGGER]: 'http',
      [HTTP_REQUEST_METHOD]: 'POST',
      [HTTP_ROUTE]: '/users/{id}',
      [URL_PATH]: '/users/123',
      [URL_QUERY]: 'tag=a&tag=b&q=a%20b',
      [URL_SCHEME]: 'https',
      [SERVER_ADDRESS]: 'abc123.execute-api.us-east-1.amazonaws.com',
      [SERVER_PORT]: 443,
      [CLIENT_ADDRESS]: '203.0.113.9',
      [URL_FULL]: 'https://abc123.execute-api.us-east-1.amazonaws.com/users/123?tag=a&tag=b&q=a%20b',
      [USER_AGENT_ORIGINAL]: 'curl/8.0',
      [NETWORK_PROTOCOL_NAME]: 'http',
      [NETWORK_PROTOCOL_VERSION]: '1.1',
    });
  });

  test('does not use the resource of an HTTP API payload format 1.0 event as route', () => {
    expect(getHttpRequestAttributes(httpApiV1Event, makeClient(true))).toMatchObject({
      [FAAS_TRIGGER]: 'http',
      [HTTP_ROUTE]: undefined,
      [URL_PATH]: '/users/123',
      [URL_QUERY]: undefined,
    });
  });

  test('sets HTTP attributes for an ALB event without re-encoding the query', () => {
    expect(getHttpRequestAttributes(albEvent, makeClient(true))).toEqual({
      [FAAS_TRIGGER]: 'http',
      [HTTP_REQUEST_METHOD]: 'GET',
      [HTTP_ROUTE]: undefined,
      [URL_PATH]: '/search',
      [URL_QUERY]: 'q=a%20b',
      [URL_SCHEME]: 'http',
      [SERVER_ADDRESS]: 'my-alb-123.us-east-1.elb.amazonaws.com',
      [SERVER_PORT]: 8080,
      [CLIENT_ADDRESS]: '192.0.2.44',
      [URL_FULL]: 'http://my-alb-123.us-east-1.elb.amazonaws.com:8080/search?q=a%20b',
      [USER_AGENT_ORIGINAL]: 'curl/8.0',
      [NETWORK_PROTOCOL_NAME]: 'http',
      [NETWORK_PROTOCOL_VERSION]: undefined,
    });
  });

  test.each([
    ['an empty object', {}],
    ['an SQS event', { Records: [{ eventSource: 'aws:sqs' }] }],
    ['a string', 'hello'],
    ['null', null],
  ])('sets no attributes for %s', (_name, event) => {
    expect(getHttpRequestAttributes(event, makeClient(true))).toEqual({});
  });
});

describe('getHttpResponseAttributes', () => {
  test('uses the returned status code', () => {
    expect(getHttpResponseAttributes(functionUrlEvent, { statusCode: 404, body: '' })).toEqual({
      [HTTP_RESPONSE_STATUS_CODE]: 404,
    });
    expect(getHttpResponseAttributes(restApiEvent, { statusCode: 201 })).toEqual({
      [HTTP_RESPONSE_STATUS_CODE]: 201,
    });
  });

  test('infers a 200 for payload format 2.0 results without a status code', () => {
    expect(getHttpResponseAttributes(functionUrlEvent, 'hello')).toEqual({ [HTTP_RESPONSE_STATUS_CODE]: 200 });
    expect(getHttpResponseAttributes(functionUrlEvent, { message: 'hello' })).toEqual({
      [HTTP_RESPONSE_STATUS_CODE]: 200,
    });
  });

  test('does not infer a status code for payload format 1.0 or missing results', () => {
    expect(getHttpResponseAttributes(restApiEvent, { body: 'hello' })).toEqual({});
    expect(getHttpResponseAttributes(albEvent, 'hello')).toEqual({});
    expect(getHttpResponseAttributes(functionUrlEvent, undefined)).toEqual({});
  });

  test('sets no attributes for non-HTTP events', () => {
    expect(getHttpResponseAttributes({ Records: [{ eventSource: 'aws:sqs' }] }, { statusCode: 200 })).toEqual({});
    expect(getHttpResponseAttributes(undefined, { statusCode: 200 })).toEqual({});
  });
});
