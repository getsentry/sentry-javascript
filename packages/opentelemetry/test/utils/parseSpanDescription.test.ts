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
  MESSAGING_SYSTEM,
  RPC_SERVICE,
  SENTRY_KIND,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, SentrySpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { descriptionForHttpMethod, getSanitizedUrl, parseSpanDescription } from '../../src/utils/parseSpanDescription';

describe('inferSpanData', () => {
  it.each([
    [
      'works without attributes & name',
      undefined,
      {
        op: undefined,
      },
    ],
    [
      'works with empty attributes',
      {},
      {
        op: undefined,
      },
    ],
    [
      'works with deprecated http method',
      {
        [HTTP_METHOD]: 'GET',
        [SENTRY_KIND]: 'client',
      },
      {
        op: 'http.client',
      },
    ],
    [
      'works with http method',
      {
        'http.request.method': 'GET',
        [SENTRY_KIND]: 'client',
      },
      {
        op: 'http.client',
      },
    ],
    [
      'works with db system',
      {
        [DB_SYSTEM]: 'mysql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SENTRY_KIND]: 'client',
      },
      {
        op: 'db',
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
      {
        op: 'db',
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
      {
        op: 'db',
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
      {
        op: 'db',
      },
    ],
    [
      'works with db system without statement',
      {
        [DB_SYSTEM]: 'mysql',
        [SENTRY_KIND]: 'client',
      },
      {
        op: 'db',
      },
    ],
    [
      'works with db.system.name (stable attribute)',
      {
        [DB_SYSTEM_NAME]: 'postgresql',
        [DB_STATEMENT]: 'SELECT * from users',
        [SENTRY_KIND]: 'client',
      },
      {
        op: 'db',
      },
    ],
    [
      'works with db.system.name without statement',
      {
        [DB_SYSTEM_NAME]: 'postgresql',
        [SENTRY_KIND]: 'client',
      },
      {
        op: 'db',
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
      {
        op: 'db',
      },
    ],
    [
      'works with rpc service',
      {
        [RPC_SERVICE]: 'rpc-test-service',
      },
      {
        op: 'rpc',
      },
    ],
    [
      'works with rpc service and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [RPC_SERVICE]: 'rpc-test-service',
      },
      {
        op: 'rpc',
      },
    ],
    [
      'works with rpc service and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [RPC_SERVICE]: 'rpc-test-service',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      {
        op: 'rpc',
      },
    ],
    [
      'works with rpc service and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [RPC_SERVICE]: 'rpc-test-service',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      {
        op: 'rpc',
      },
    ],
    [
      'works with messaging system',
      {
        [MESSAGING_SYSTEM]: 'test-messaging-system',
      },
      {
        op: 'queue',
      },
    ],
    [
      'works with messaging system and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [MESSAGING_SYSTEM]: 'test-messaging-system',
      },
      {
        op: 'queue',
      },
    ],
    [
      'works with messaging system and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [MESSAGING_SYSTEM]: 'test-messaging-system',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      {
        op: 'queue',
      },
    ],
    [
      'works with messaging system and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [MESSAGING_SYSTEM]: 'test-messaging-system',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      {
        op: 'queue',
      },
    ],
    [
      'works with http faas trigger',
      {
        [FAAS_TRIGGER]: 'http',
      },
      {
        op: 'http.server',
      },
    ],
    [
      'works with pubsub faas trigger',
      {
        [FAAS_TRIGGER]: 'pubsub',
      },
      {
        op: 'queue.process',
      },
    ],
    [
      'falls back to function op for unknown faas trigger',
      {
        [FAAS_TRIGGER]: 'test-faas-trigger',
      },
      {
        op: 'function',
      },
    ],
    [
      'works with faas trigger and custom source',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [FAAS_TRIGGER]: 'test-faas-trigger',
      },
      {
        op: 'function',
      },
    ],
    [
      'works with faas trigger and custom source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [FAAS_TRIGGER]: 'test-faas-trigger',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      {
        op: 'function',
      },
    ],
    [
      'works with faas trigger and component source and custom name',
      {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [FAAS_TRIGGER]: 'test-faas-trigger',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
      },
      {
        op: 'function',
      },
    ],
  ] as const)('%s', (_, attributes, expected) => {
    const actual = parseSpanDescription(new SentrySpan({ attributes }));
    expect(actual).toEqual(expected);
  });
});

describe('descriptionForHttpMethod', () => {
  it.each([
    [
      'works without attributes',
      {},
      {
        op: 'http',
      },
    ],
    [
      'works with basic client GET',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client',
        data: {
          'url.full': 'https://www.example.com/my-path',
        },
      },
    ],
    [
      'works with prefetch request',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
        'sentry.http.prefetch': true,
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client.prefetch',
        data: {
          'url.full': 'https://www.example.com/my-path',
        },
      },
    ],
    [
      'works with basic server POST',
      {
        [HTTP_METHOD]: 'POST',
        [URL_FULL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
        [SENTRY_KIND]: 'server' as const,
      },
      {
        op: 'http.server',
        data: {
          'url.full': 'https://www.example.com/my-path',
        },
      },
    ],
    [
      'works with client GET with route',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client',
        data: {
          'url.full': 'https://www.example.com/my-path/123',
        },
      },
    ],
    [
      'works with basic client GET without span kind',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path',
        [HTTP_TARGET]: '/my-path',
      },
      {
        op: 'http',
        data: {
          'url.full': 'https://www.example.com/my-path',
        },
      },
    ],
    [
      "doesn't overwrite span name with source custom",
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client',
        data: {
          'url.full': 'https://www.example.com/my-path/123',
        },
      },
    ],
    [
      'takes user-passed span name (with source custom)',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client',
        data: {
          'url.full': 'https://www.example.com/my-path/123',
        },
      },
    ],
    [
      'takes user-passed span name (with source component)',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path/123',
        [HTTP_TARGET]: '/my-path/123',
        [HTTP_ROUTE]: '/my-path/:id',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: 'custom name',
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client',
        data: {
          'url.full': 'https://www.example.com/my-path/123',
        },
      },
    ],
    [
      'strips the leading `?`/`#` from http.query and http.fragment',
      {
        [HTTP_METHOD]: 'GET',
        [URL_FULL]: 'https://www.example.com/my-path?id=1#section',
        [HTTP_TARGET]: '/my-path?id=1#section',
        [SENTRY_KIND]: 'client' as const,
      },
      {
        op: 'http.client',
        data: {
          'url.full': 'https://www.example.com/my-path',
          'url.query': 'id=1',
          'url.fragment': 'section',
        },
      },
    ],
  ])('%s', (_, attributes, expected) => {
    const actual = descriptionForHttpMethod(attributes);
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
        [URL_FULL]: 'http://example.com/?what=true',
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
        [URL_FULL]: 'http://example.com/sub#hash',
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
        [URL_FULL]: 'http://example.com/?what=true',
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
        [URL_FULL]: 'http://example.com/?what=true',
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
        [URL_FULL]: 'http://example.com/?what=true',
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
        [URL_FULL]: 'http://example.com/?what=true',
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
