/* eslint-disable typescript/no-deprecated */
import {
  DB_STATEMENT,
  DB_SYSTEM,
  DB_SYSTEM_NAME,
  FAAS_TRIGGER,
  HTTP_HOST,
  HTTP_METHOD,
  HTTP_ROUTE,
  HTTP_STATUS_CODE,
  HTTP_TARGET,
  HTTP_URL,
  MESSAGING_SYSTEM,
  RPC_SERVICE,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  descriptionForHttpMethod,
  getSanitizedUrl,
  getUserUpdatedNameAndSource,
  inferSpanData,
} from '../../src/utils/parseSpanDescription';

describe('inferSpanData', () => {
  it.each([
    [
      'works with empty attributes',
      {},
      'test name',
      {
        description: 'test name',
        op: undefined,
        source: 'custom',
      },
    ],
    [
      'works with deprecated http method',
      {
        [HTTP_METHOD]: 'GET',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'test name',
        op: 'http.client',
        source: 'custom',
      },
    ],
    [
      'works with http method',
      {
        'http.request.method': 'GET',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'test name',
        op: 'http.client',
        source: 'custom',
      },
    ],
    [
      'works with db system',
      {
        [DB_SYSTEM]: 'mysql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'SELECT * from users',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'works with db system and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [DB_SYSTEM]: 'mysql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'test name',
        op: 'db',
        source: 'custom',
      },
    ],
    [
      'works with db system and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [DB_SYSTEM]: 'mysql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'custom name',
        op: 'db',
        source: 'custom',
      },
    ],
    [
      'works with db system and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [DB_SYSTEM]: 'mysql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'custom name',
        op: 'db',
        source: 'component',
      },
    ],
    [
      'works with db system without statement',
      {
        [DB_SYSTEM]: 'mysql',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'test name',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'works with db.system.name (stable attribute)',
      {
        [DB_SYSTEM_NAME]: 'postgresql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'SELECT * from users',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'works with db.system.name without statement',
      {
        [DB_SYSTEM_NAME]: 'postgresql',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'test name',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'prefers db.system.name over deprecated db.system',
      {
        [DB_SYSTEM_NAME]: 'postgresql',
        [DB_SYSTEM]: 'mysql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SENTRY_KIND]: 'client',
      },
      'test name',
      {
        description: 'SELECT * from users',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'works with rpc service',
      {
        [RPC_SERVICE]: 'rpc-test-service',
      },
      'test name',
      {
        description: 'test name',
        op: 'rpc',
        source: 'route',
      },
    ],
    [
      'works with rpc service and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [RPC_SERVICE]: 'rpc-test-service',
      },
      'test name',
      {
        description: 'test name',
        op: 'rpc',
        source: 'custom',
      },
    ],
    [
      'works with rpc service and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [RPC_SERVICE]: 'rpc-test-service',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      'test name',
      {
        description: 'custom name',
        op: 'rpc',
        source: 'custom',
      },
    ],
    [
      'works with rpc service and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [RPC_SERVICE]: 'rpc-test-service',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      'test name',
      {
        description: 'custom name',
        op: 'rpc',
        source: 'component',
      },
    ],
    [
      'works with messaging system',
      {
        [MESSAGING_SYSTEM]: 'test-messaging-system',
      },
      'test name',
      {
        description: 'test name',
        op: 'message',
        source: 'route',
      },
    ],
    [
      'works with messaging system and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [MESSAGING_SYSTEM]: 'test-messaging-system',
      },
      'test name',
      {
        description: 'test name',
        op: 'message',
        source: 'custom',
      },
    ],
    [
      'works with messaging system and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [MESSAGING_SYSTEM]: 'test-messaging-system',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      'test name',
      {
        description: 'custom name',
        op: 'message',
        source: 'custom',
      },
    ],
    [
      'works with messaging system and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [MESSAGING_SYSTEM]: 'test-messaging-system',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      'test name',
      {
        description: 'custom name',
        op: 'message',
        source: 'component',
      },
    ],
    [
      'works with faas trigger',
      {
        [FAAS_TRIGGER]: 'test-faas-trigger',
      },
      'test name',
      {
        description: 'test name',
        op: 'test-faas-trigger',
        source: 'route',
      },
    ],
    [
      'works with faas trigger and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [FAAS_TRIGGER]: 'test-faas-trigger',
      },
      'test name',
      {
        description: 'test name',
        op: 'test-faas-trigger',
        source: 'custom',
      },
    ],
    [
      'works with faas trigger and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [FAAS_TRIGGER]: 'test-faas-trigger',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      'test name',
      {
        description: 'custom name',
        op: 'test-faas-trigger',
        source: 'custom',
      },
    ],
    [
      'works with faas trigger and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [FAAS_TRIGGER]: 'test-faas-trigger',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      'test name',
      {
        description: 'custom name',
        op: 'test-faas-trigger',
        source: 'component',
      },
    ],
  ])('%s', (_, attributes, name, expected) => {
    const actual = inferSpanData(name, attributes);
    expect(actual).toEqual(expected);
  });
});

describe('descriptionForHttpMethod', () => {
  it.each([
    [
      'works without attributes',
      'GET',
      {},
      'test name',
      {
        op: 'http',
        description: 'test name',
        source: 'custom',
      },
    ],
    [
      'works with basic client GET',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client',
        description: 'GET https://www.example.com/my-path',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'url',
      },
    ],
    [
      'works with prefetch request',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
        'sentry.http.prefetch': true,
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client.prefetch',
        description: 'GET https://www.example.com/my-path',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'url',
      },
    ],
    [
      'works with basic server POST',
      'POST',
      {
        [HTTP_METHOD]: 'POST',
        [HTTP_URL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
        [SENTRY_KIND]: 'server' as const,
      },
      'test name',
      {
        op: 'http.server',
        description: 'POST /my-path',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'url',
      },
    ],
    [
      'works with client GET with route',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client',
        description: 'GET /my-path/:id',
        data: {
          url: 'https://www.example.com/my-path/123',
        },
        source: 'route',
      },
    ],
    [
      'works with basic client GET without span kind',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
      },
      'test name',
      {
        op: 'http',
        description: 'test name',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'custom',
      },
    ],
    [
      "doesn't overwrite span name with source custom",
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client',
        description: 'test name',
        data: {
          url: 'https://www.example.com/my-path/123',
        },
        source: 'custom',
      },
    ],
    [
      'takes user-passed span name (with source custom)',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client',
        description: 'custom name',
        data: {
          url: 'https://www.example.com/my-path/123',
        },
        source: 'custom',
      },
    ],
    [
      'takes user-passed span name (with source component)',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client',
        description: 'custom name',
        data: {
          url: 'https://www.example.com/my-path/123',
        },
        source: 'component',
      },
    ],
    [
      'strips the leading `?`/`#` from http.query and http.fragment',
      'GET',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_URL]: 'https://www.example.com/my-path?id=1#section',
        [HTTP_TARGET]: '/my-path?id=1#section',
        [SENTRY_KIND]: 'client' as const,
      },
      'test name',
      {
        op: 'http.client',
        description: 'GET https://www.example.com/my-path',
        data: {
          url: 'https://www.example.com/my-path',
          'http.query': 'id=1',
          'http.fragment': 'section',
        },
        source: 'url',
      },
    ],
  ])('%s', (_, httpMethod, attributes, name, expected) => {
    const actual = descriptionForHttpMethod({ attributes, name }, httpMethod);
    expect(actual).toEqual(expected);
  });
});

describe('getSanitizedUrl', () => {
  it.each([
    [
      'works without attributes',
      {},
      {
        urlPath: undefined,
        url: undefined,
        fragment: undefined,
        query: undefined,
        hasRoute: false,
      },
    ],
    [
      'uses url without query for client request',
      {
        [HTTP_URL]: 'http://example.com/?what=true',
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/?what=true',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'client',
      },
      {
        urlPath: 'http://example.com/',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: false,
      },
    ],
    [
      'uses url without hash for client request',
      {
        [HTTP_URL]: 'http://example.com/sub#hash',
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/sub#hash',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'client',
      },
      {
        urlPath: 'http://example.com/sub',
        url: 'http://example.com/sub',
        fragment: '#hash',
        query: undefined,
        hasRoute: false,
      },
    ],
    [
      'uses route if available for client request',
      {
        [HTTP_URL]: 'http://example.com/?what=true',
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/?what=true',
        [HTTP_ROUTE]: '/my-route',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'client',
      },
      {
        urlPath: '/my-route',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: true,
      },
    ],
    [
      'falls back to target for client request if url not available',
      {
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/?what=true',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'client',
      },
      {
        urlPath: '/',
        url: undefined,
        fragment: undefined,
        query: undefined,
        hasRoute: false,
      },
    ],
    [
      'uses target without query for server request',
      {
        [HTTP_URL]: 'http://example.com/?what=true',
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/?what=true',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'server',
      },
      {
        urlPath: '/',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: false,
      },
    ],
    [
      'uses target without hash for server request',
      {
        [HTTP_URL]: 'http://example.com/?what=true',
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/sub#hash',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'server',
      },
      {
        urlPath: '/sub',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: false,
      },
    ],
    [
      'uses route for server request if available',
      {
        [HTTP_URL]: 'http://example.com/?what=true',
        [HTTP_METHOD]: 'GET',
        [HTTP_TARGET]: '/?what=true',
        [HTTP_ROUTE]: '/my-route',
        [HTTP_HOST]: 'example.com:80',
        [HTTP_STATUS_CODE]: 200,
        [SENTRY_KIND]: 'server',
      },
      {
        urlPath: '/my-route',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: true,
      },
    ],
  ])('%s', (_, attributes, expected) => {
    const actual = getSanitizedUrl(attributes);

    expect(actual).toEqual(expected);
  });
});

describe('getUserUpdatedNameAndSource', () => {
  it('returns param name if `SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME` attribute is not set', () => {
    expect(getUserUpdatedNameAndSource('base name', {})).toEqual({ description: 'base name', source: 'custom' });
  });

  it('returns param name with custom fallback source if `SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME` attribute is not set', () => {
    expect(getUserUpdatedNameAndSource('base name', {}, 'route')).toEqual({
      description: 'base name',
      source: 'route',
    });
  });

  it('returns param name if `SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME` attribute is not a string', () => {
    expect(getUserUpdatedNameAndSource('base name', { [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 123 })).toEqual({
      description: 'base name',
      source: 'custom',
    });
  });

  it.each(['custom', 'task', 'url', 'route'])(
    'returns `SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME` attribute if is a string and source is %s',
    source => {
      expect(
        getUserUpdatedNameAndSource('base name', {
          [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        }),
      ).toEqual({
        description: 'custom name',
        source,
      });
    },
  );
});
