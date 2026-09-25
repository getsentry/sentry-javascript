import {
  HTTP_REQUEST_METHOD,
  SENTRY_KIND,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FRAGMENT,
  URL_DOMAIN,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
} from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { channel } from 'node:diagnostics_channel';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UndiciRequest } from '../../src/integrations/node-fetch/types';

const { span, startInactiveSpan, getClient } = vi.hoisted(() => ({
  span: {},
  startInactiveSpan: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('@sentry/core', async () => {
  const actual = (await vi.importActual('@sentry/core')) as Record<string, unknown>;
  return {
    ...actual,
    getClient,
    startInactiveSpan: startInactiveSpan.mockReturnValue(span),
  };
});

vi.mock('../../src/utils/outgoingFetchRequest', () => ({
  addFetchRequestBreadcrumb: vi.fn(),
  addTracePropagationHeadersToFetchRequest: vi.fn(),
}));

describe('instrumentUndici', () => {
  beforeAll(async () => {
    const { instrumentUndici } = await import('../../src/integrations/node-fetch/undici-instrumentation');
    instrumentUndici({ spans: true });
  });

  beforeEach(() => {
    startInactiveSpan.mockClear();
    getClient.mockReturnValue(undefined);
  });

  it.each(['QUERY', 'query'])('normalizes %s as QUERY in client span metadata', method => {
    const request = {
      method,
      origin: 'https://api.example.com',
      path: '/resources?limit=10',
      headers: [],
    } as unknown as UndiciRequest;

    channel('undici:request:create').publish({ request });

    expect(startInactiveSpan).toHaveBeenCalledWith({
      name: 'QUERY https://api.example.com/resources',
      attributes: {
        [SENTRY_KIND]: 'client',
        [SENTRY_OP]: 'http.client',
        [HTTP_REQUEST_METHOD]: 'QUERY',
        'http.request.method_original': method,
        [URL_FULL]: 'https://api.example.com/resources?limit=10',
        [URL_DOMAIN]: 'api.example.com',
        [URL_PATH]: '/resources',
        [URL_QUERY]: 'limit=10',
        [URL_FRAGMENT]: undefined,
        [URL_SCHEME]: 'https',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.node_fetch',
        [SERVER_ADDRESS]: 'api.example.com',
        [SERVER_PORT]: 443,
      },
      onlyIfParent: true,
    });
  });

  it.each([true, false])('falls back to `HTTP` for an unknown method (span streaming: %s)', streaming => {
    getClient.mockReturnValue(streaming ? { getOptions: () => ({ traceLifecycle: 'stream' }) } : undefined);

    const request = {
      method: 'FROBNICATE',
      origin: 'https://api.example.com',
      path: '/resources',
      headers: [],
    } as unknown as UndiciRequest;

    channel('undici:request:create').publish({ request });

    expect(startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ name: 'HTTP' }));
  });

  it('drops the URL path but keeps the domain with span streaming enabled', () => {
    getClient.mockReturnValue({ getOptions: () => ({ traceLifecycle: 'stream' }) });

    const request = {
      method: 'QUERY',
      origin: 'https://api.example.com',
      path: '/resources?limit=10',
      headers: [],
    } as unknown as UndiciRequest;

    channel('undici:request:create').publish({ request });

    expect(startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'QUERY api.example.com', onlyIfParent: false }),
    );
  });
});
