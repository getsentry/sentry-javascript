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
      'faas.trigger': 'http',
      'http.request.method': 'GET',
      'http.route': undefined,
      'url.path': '/favicon.ico',
      'url.query': 'size=32&theme=dark',
      'url.scheme': 'https',
      'server.address': 'abc123.lambda-url.us-east-1.on.aws',
      'server.port': 443,
      'client.address': '198.51.100.7',
      'user_agent.original': 'Mozilla/5.0',
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
    });
  });

  test('omits client.address when user info is not collected', () => {
    expect(getHttpRequestAttributes(functionUrlEvent, makeClient(false))['client.address']).toBeUndefined();
    expect(getHttpRequestAttributes(functionUrlEvent, undefined)['client.address']).toBeUndefined();
  });

  test('takes the route template from an HTTP API route key', () => {
    expect(getHttpRequestAttributes(httpApiV2Event, makeClient(true))).toMatchObject({
      'http.route': '/users/{id}',
      'url.path': '/users/123',
      'url.query': undefined,
      'server.address': 'api.example.com',
    });
  });

  test('sets HTTP attributes for a REST API event', () => {
    expect(getHttpRequestAttributes(restApiEvent, makeClient(true))).toEqual({
      'faas.trigger': 'http',
      'http.request.method': 'POST',
      'http.route': '/users/{id}',
      'url.path': '/users/123',
      'url.query': 'tag=a&tag=b&q=a%20b',
      'url.scheme': 'https',
      'server.address': 'abc123.execute-api.us-east-1.amazonaws.com',
      'server.port': 443,
      'client.address': '203.0.113.9',
      'user_agent.original': 'curl/8.0',
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
    });
  });

  test('does not use the resource of an HTTP API payload format 1.0 event as route', () => {
    expect(getHttpRequestAttributes(httpApiV1Event, makeClient(true))).toMatchObject({
      'faas.trigger': 'http',
      'http.route': undefined,
      'url.path': '/users/123',
      'url.query': undefined,
    });
  });

  test('sets HTTP attributes for an ALB event without re-encoding the query', () => {
    expect(getHttpRequestAttributes(albEvent, makeClient(true))).toEqual({
      'faas.trigger': 'http',
      'http.request.method': 'GET',
      'http.route': undefined,
      'url.path': '/search',
      'url.query': 'q=a%20b',
      'url.scheme': 'http',
      'server.address': 'my-alb-123.us-east-1.elb.amazonaws.com',
      'server.port': 8080,
      'client.address': '192.0.2.44',
      'user_agent.original': 'curl/8.0',
      'network.protocol.name': 'http',
      'network.protocol.version': undefined,
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
      'http.response.status_code': 404,
    });
    expect(getHttpResponseAttributes(restApiEvent, { statusCode: 201 })).toEqual({
      'http.response.status_code': 201,
    });
  });

  test('infers a 200 for payload format 2.0 results without a status code', () => {
    expect(getHttpResponseAttributes(functionUrlEvent, 'hello')).toEqual({ 'http.response.status_code': 200 });
    expect(getHttpResponseAttributes(functionUrlEvent, { message: 'hello' })).toEqual({
      'http.response.status_code': 200,
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
