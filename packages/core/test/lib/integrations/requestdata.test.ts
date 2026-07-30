import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/client';
import * as currentScopes from '../../../src/currentScopes';
import { requestDataIntegration } from '../../../src/integrations/requestdata';
import type { DataCollection } from '../../../src/types/datacollection';
import type { Event } from '../../../src/types/event';
import type { StreamedSpanJSON } from '../../../src/types/span';
import { resolveDataCollectionOptions } from '../../../src/utils/data-collection/resolveDataCollectionOptions';
import { ipHeaderNames } from '../../../src/vendor/getIpAddress';

function mockClient(sendDefaultPii: boolean | undefined, dataCollection?: DataCollection): Client {
  return {
    getOptions: () => ({ sendDefaultPii: sendDefaultPii as boolean | undefined }),
    getDataCollectionOptions: () => resolveDataCollectionOptions({ sendDefaultPii, dataCollection }),
  } as unknown as Client;
}

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    sdkProcessingMetadata: {
      normalizedRequest: {
        method: 'GET',
        url: 'https://example.com/path',
        headers: {
          Host: 'example.com',
          'X-Forwarded-For': '192.168.1.1',
          'CF-Connecting-IP': '10.0.0.2',
        },
      },
    },
    ...overrides,
  };
}

/** Rich normalized request (Cookie header only — tests `parseCookie` path). */
function richNormalizedRequest() {
  return {
    method: 'POST',
    url: 'https://example.com/items?q=1',
    query_string: 'q=1',
    data: { body: 'payload' },
    headers: {
      Host: 'example.com',
      cookie: 'session=from-header',
      'X-Forwarded-For': '192.168.1.1',
      'X-Custom': 'keep',
    },
  };
}

describe('requestDataIntegration', () => {
  describe('IP-related headers on event.request', () => {
    it('removes known IP headers from event.request.headers when userInfo is false', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
      });
    });

    it('removes every ipHeaderNames entry when userInfo is false', () => {
      const integration = requestDataIntegration();
      const headers: Record<string, string> = { Host: 'example.com', 'X-Other': 'keep-me' };
      for (const name of ipHeaderNames) {
        headers[name] = '203.0.113.1';
      }
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers,
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
        'X-Other': 'keep-me',
      });
    });

    it('keeps IP headers on event.request.headers when userInfo is true', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
        'X-Forwarded-For': '192.168.1.1',
        'CF-Connecting-IP': '10.0.0.2',
      });
    });

    it('includes user IP when include.ip is true and dataCollection.userInfo is false', () => {
      const integration = requestDataIntegration({ include: { ip: true } });
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(false, { userInfo: false }));

      expect(event.request?.headers?.['X-Forwarded-For']).toBe('192.168.1.1');
      expect(event.user?.ip_address).toBe('192.168.1.1');
    });

    it('strips IP headers when include.ip is false even if userInfo is true', () => {
      const integration = requestDataIntegration({ include: { ip: false } });
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toEqual({ Host: 'example.com' });
    });

    it('removes every ipHeaderNames entry when keys use lowercase spelling and userInfo is false', () => {
      const integration = requestDataIntegration();
      const headers: Record<string, string> = { host: 'example.com', 'x-other': 'keep-me' };
      for (const name of ipHeaderNames) {
        headers[name.toLowerCase()] = '203.0.113.1';
      }
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers,
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toEqual({
        host: 'example.com',
        'x-other': 'keep-me',
      });
    });

    it('keeps lowercase IP headers on event.request.headers when userInfo is true', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/path',
            headers: {
              host: 'example.com',
              'x-forwarded-for': '192.168.1.1',
              'cf-connecting-ip': '10.0.0.2',
            },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toEqual({
        host: 'example.com',
        'x-forwarded-for': '192.168.1.1',
        'cf-connecting-ip': '10.0.0.2',
      });
    });
  });

  describe('user.ip_address', () => {
    it('does not set user.ip_address when userInfo is false', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.user?.ip_address).toBeUndefined();
    });

    it('sets user.ip_address from request headers when userInfo is true', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.user?.ip_address).toBe('192.168.1.1');
    });

    it('sets user.ip_address from lowercase IP headers when userInfo is true', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/path',
            headers: {
              host: 'example.com',
              'x-forwarded-for': '192.168.1.9',
            },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.user?.ip_address).toBe('192.168.1.9');
    });

    it('sets user.ip_address from sdkProcessingMetadata.ipAddress when headers yield no IP', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          ipAddress: '198.51.100.7',
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { Host: 'example.com' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.user?.ip_address).toBe('198.51.100.7');
    });

    it('does not set user.ip_address from sdkProcessingMetadata when userInfo is false', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          ipAddress: '198.51.100.7',
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { Host: 'example.com' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.user?.ip_address).toBeUndefined();
    });
  });

  describe('include.headers', () => {
    it('omits event.request.headers when include.headers is false', () => {
      const integration = requestDataIntegration({ include: { headers: false } });
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toBeUndefined();
      expect(event.request?.method).toBe('POST');
      expect(event.request?.url).toBe('https://example.com/items?q=1');
    });

    it('with include.headers false and include.cookies true, parses cookies from the cookie header without exposing headers', () => {
      const integration = requestDataIntegration({
        include: { headers: false, cookies: true },
      });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { cookie: 'id=42' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toBeUndefined();
      expect(event.request?.cookies).toEqual({ id: '42' });
    });

    it('omits headers when include.headers is false and dataCollection enables headers', () => {
      const integration = requestDataIntegration({ include: { headers: false } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { headers: { Accept: 'application/json' } },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { httpHeaders: { request: true, response: true } }));

      expect(event.request?.headers).toBeUndefined();
    });

    it('applies the configured header allowlist when include.headers is true', () => {
      const integration = requestDataIntegration({ include: { headers: true } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            headers: { Accept: 'application/json', 'X-Request-Id': 'req-123', Authorization: 'Bearer secret' },
          },
        },
      };

      integration.processEvent?.(
        event,
        {},
        mockClient(false, { httpHeaders: { request: { allow: ['accept'] }, response: true } }),
      );

      expect(event.request?.headers).toEqual({
        Accept: 'application/json',
        'X-Request-Id': '[Filtered]',
        Authorization: '[Filtered]',
      });
    });

    it('with include.headers false, still sets user.ip_address from original headers when userInfo is true', () => {
      const integration = requestDataIntegration({ include: { headers: false } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { 'X-Forwarded-For': '192.0.2.1' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toBeUndefined();
      expect(event.user?.ip_address).toBe('192.0.2.1');
    });
  });

  it('filters sensitive request headers', () => {
    const integration = requestDataIntegration();
    const event: Event = {
      sdkProcessingMetadata: {
        normalizedRequest: {
          headers: { Accept: 'application/json', Authorization: 'Bearer secret' },
        },
      },
    };

    integration.processEvent?.(event, {}, mockClient(false));

    expect(event.request?.headers).toEqual({ Accept: 'application/json', Authorization: '[Filtered]' });
  });

  describe('include.cookies', () => {
    it('removes the cookie header from event.request.headers when include.cookies is false', () => {
      const integration = requestDataIntegration({
        include: { cookies: false },
      });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: {
              Host: 'example.com',
              cookie: 'secret=value',
              'X-Custom': 'ok',
            },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
        'X-Custom': 'ok',
      });
    });

    it('omits event.request.cookies when include.cookies is false', () => {
      const integration = requestDataIntegration({
        include: { cookies: false },
      });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { cookie: 'a=b' },
            cookies: { sid: '1' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toBeUndefined();
    });

    it('omits cookies when include.cookies is false and dataCollection enables cookies', () => {
      const integration = requestDataIntegration({ include: { cookies: false } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { cookies: { theme: 'dark' } },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { cookies: true }));

      expect(event.request?.cookies).toBeUndefined();
    });

    it('applies the default denylist when include.cookies overrides dataCollection.cookies=false', () => {
      const integration = requestDataIntegration({ include: { cookies: true } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { cookies: { theme: 'dark', session: 'secret' } },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { cookies: false }));

      expect(event.request?.cookies).toEqual({ theme: 'dark', session: '[Filtered]' });
    });

    it('preserves the configured cookie denylist when include.cookies is true', () => {
      const integration = requestDataIntegration({ include: { cookies: true } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { cookies: { theme: 'dark', experiment: 'variant-a', session: 'secret' } },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { cookies: { deny: ['experiment'] } }));

      expect(event.request?.cookies).toEqual({
        theme: 'dark',
        experiment: '[Filtered]',
        session: '[Filtered]',
      });
    });

    it('preserves the configured cookie allowlist when include.cookies is true', () => {
      const integration = requestDataIntegration({ include: { cookies: true } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { cookies: { theme: 'dark', locale: 'en', session: 'secret' } },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { cookies: { allow: ['theme'] } }));

      expect(event.request?.cookies).toEqual({
        theme: 'dark',
        locale: '[Filtered]',
        session: '[Filtered]',
      });
    });

    it('uses normalizedRequest.cookies when set', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { Host: 'example.com' },
            cookies: { preference: 'abc' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toEqual({ preference: 'abc' });
    });

    it('prefers normalizedRequest.cookies over the Cookie header when both are present', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { cookie: 'from=header' },
            cookies: { from: 'object' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toEqual({ from: 'object' });
    });

    it('parses the Cookie header when normalizedRequest.cookies is absent', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { cookie: 'a=1; b=two' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toEqual({ a: '1', b: 'two' });
    });

    it('filters sensitive cookies with the default denylist', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            headers: { cookie: 'theme=dark; session=secret; connect.sid=secret' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toEqual({
        theme: 'dark',
        session: '[Filtered]',
        'connect.sid': '[Filtered]',
      });
    });

    it('applies a custom cookie denylist', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            cookies: { theme: 'dark', experiment: 'variant-a' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { cookies: { deny: ['experiment'] } }));

      expect(event.request?.cookies).toEqual({ theme: 'dark', experiment: '[Filtered]' });
    });

    it('sets event.request.cookies to an empty object when include.cookies is true but no cookies are present', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { Host: 'example.com' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toEqual({});
    });
  });

  describe('include.url', () => {
    it('omits event.request.url when include.url is false', () => {
      const integration = requestDataIntegration({ include: { url: false } });
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.url).toBeUndefined();
      expect(event.request?.method).toBe('POST');
    });
  });

  describe('include.query_string', () => {
    it('omits query string when include.query_string is false and dataCollection enables query params', () => {
      const integration = requestDataIntegration({ include: { query_string: false } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { query_string: 'page=1' },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { urlQueryParams: true }));

      expect(event.request?.query_string).toBeUndefined();
    });

    it('applies the default denylist when include.query_string overrides dataCollection.urlQueryParams=false', () => {
      const integration = requestDataIntegration({ include: { query_string: true } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { query_string: 'page=1&token=secret' },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { urlQueryParams: false }));

      expect(event.request?.query_string).toBe('page=1&token=[Filtered]');
    });

    it('preserves encoded query parameter values while filtering sensitive parameters', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { query_string: 'q=hello%20world&token=secret' },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.query_string).toBe('q=hello%20world&token=[Filtered]');
    });

    it('preserves the configured query allowlist when include.query_string is true', () => {
      const integration = requestDataIntegration({ include: { query_string: true } });
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: { query_string: 'page=1&sort=name&token=secret' },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false, { urlQueryParams: { allow: ['page'] } }));

      expect(event.request?.query_string).toBe('page=1&sort=[Filtered]&token=[Filtered]');
    });

    it('omits event.request.query_string when include.query_string is false', () => {
      const integration = requestDataIntegration({ include: { query_string: false } });
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.query_string).toBeUndefined();
      expect(event.request?.url).toBe('https://example.com/items?q=1');
    });
  });

  describe('include.data', () => {
    it('omits event.request.data when include.data is false', () => {
      const integration = requestDataIntegration({ include: { data: false } });
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.data).toBeUndefined();
    });
  });

  describe('defaults and combined include options', () => {
    it('with default include and userInfo true, copies method, url, query_string, data, headers, cookies, and user IP', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request).toEqual({
        method: 'POST',
        url: 'https://example.com/items?q=1',
        query_string: 'q=1',
        data: { body: 'payload' },
        headers: {
          Host: 'example.com',
          cookie: '[Filtered]',
          'X-Forwarded-For': '192.168.1.1',
          'X-Custom': 'keep',
        },
        cookies: { session: '[Filtered]' },
      });
      expect(event.user?.ip_address).toBe('192.168.1.1');
    });

    it('with default include and userInfo false, keeps non-IP fields and strips IP from headers and user', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
        cookie: '[Filtered]',
        'X-Custom': 'keep',
      });
      expect(event.request?.cookies).toEqual({ session: '[Filtered]' });
      expect(event.user?.ip_address).toBeUndefined();
    });

    it('can disable multiple include flags at once', () => {
      const integration = requestDataIntegration({
        include: {
          url: false,
          query_string: false,
          data: false,
          cookies: false,
        },
      });
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.method).toBe('POST');
      expect(event.request?.headers?.Host).toBe('example.com');
      expect(event.request?.url).toBeUndefined();
      expect(event.request?.query_string).toBeUndefined();
      expect(event.request?.data).toBeUndefined();
      expect(event.request?.cookies).toBeUndefined();
      expect(event.request?.headers?.cookie).toBeUndefined();
    });
  });

  describe('normalizedRequest absent', () => {
    it('does not add event.request when it was undefined and there is no normalizedRequest', () => {
      const integration = requestDataIntegration();
      const event: Event = { sdkProcessingMetadata: {} };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request).toBeUndefined();
    });

    it('preserves existing event.request when there is no normalizedRequest', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        request: { url: 'https://unchanged/' },
        sdkProcessingMetadata: {},
      };

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request).toEqual({ url: 'https://unchanged/' });
    });
  });

  describe('merging with existing event.request', () => {
    it('merges new request fields into an existing event.request', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        request: { env: { INTEGRATION: 'test' } },
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'PUT',
            url: 'https://example.com/r',
            headers: { Host: 'example.com' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.env).toEqual({ INTEGRATION: 'test' });
      expect(event.request?.method).toBe('PUT');
      expect(event.request?.url).toBe('https://example.com/r');
    });

    it('does not clear an existing event.request.url when include.url is false (object spread merge)', () => {
      const integration = requestDataIntegration({ include: { url: false } });
      const event: Event = {
        request: { url: 'https://preserved/' },
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/new',
            headers: {},
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.url).toBe('https://preserved/');
      expect(event.request?.method).toBe('GET');
    });
  });

  it('does not mutate normalizedRequest.headers on the event (copy is used)', () => {
    const integration = requestDataIntegration();
    const normalizedHeaders = {
      Host: 'example.com',
      'X-Forwarded-For': '192.168.1.1',
    };
    const event: Event = {
      sdkProcessingMetadata: {
        normalizedRequest: {
          method: 'GET',
          url: 'https://example.com/',
          headers: normalizedHeaders,
        },
      },
    };

    integration.processEvent?.(event, {}, mockClient(false));

    expect(normalizedHeaders['X-Forwarded-For']).toBe('192.168.1.1');
    expect(event.request?.headers?.['X-Forwarded-For']).toBeUndefined();
  });
});

describe('requestDataIntegration processSegmentSpan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeSpan(overrides: Partial<StreamedSpanJSON> = {}): StreamedSpanJSON {
    return {
      name: 'GET /test',
      span_id: 'abc123',
      trace_id: 'def456',
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
      is_segment: true,
      attributes: {},
      ...overrides,
    };
  }

  function mockIsolationScope(normalizedRequest: Record<string, unknown>, ipAddress?: string): void {
    vi.spyOn(currentScopes, 'getIsolationScope').mockReturnValue({
      getScopeData: () => ({
        sdkProcessingMetadata: { normalizedRequest, ipAddress },
      }),
    } as ReturnType<typeof currentScopes.getIsolationScope>);
  }

  it('applies request data attributes to the segment span', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({
      url: 'https://example.com/api/users',
      method: 'GET',
      query_string: 'page=1&limit=10',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
    });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toMatchObject({
      'url.full': 'https://example.com/api/users',
      'http.request.method': 'GET',
      'url.query': 'page=1&limit=10',
      'http.request.header.content_type': 'application/json',
      'http.request.header.accept': 'application/json',
    });
  });

  it('does not apply attributes when normalizedRequest is missing', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({});

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toEqual({});
  });

  it('sets user.ip_address from headers when userInfo is true', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({
      url: 'https://example.com',
      headers: { 'x-forwarded-for': '203.0.113.50' },
    });

    integration.processSegmentSpan!(span, mockClient(true));

    expect(span.attributes).toMatchObject({
      'user.ip_address': '203.0.113.50',
    });
  });

  it('falls back to ipAddress from sdkProcessingMetadata', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({ url: 'https://example.com', headers: {} }, '192.168.1.1');

    integration.processSegmentSpan!(span, mockClient(true));

    expect(span.attributes).toMatchObject({
      'user.ip_address': '192.168.1.1',
    });
  });

  it('does not set user.ip_address when userInfo is false', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({
      url: 'https://example.com',
      headers: { 'x-forwarded-for': '203.0.113.50' },
    });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).not.toHaveProperty('user.ip_address');
  });

  it('applies cookies from normalizedRequest.cookies', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({
      cookies: { theme: 'dark', locale: 'en' },
    });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toMatchObject({
      'http.request.header.cookie.theme': 'dark',
      'http.request.header.cookie.locale': 'en',
    });
  });

  it('falls back to cookie header when normalizedRequest.cookies is not set', () => {
    const integration = requestDataIntegration({ include: { headers: false } });
    const span = makeSpan();

    mockIsolationScope({
      headers: { cookie: 'theme=dark; locale=en' },
    });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toMatchObject({
      'http.request.header.cookie.theme': 'dark',
      'http.request.header.cookie.locale': 'en',
    });
  });

  it('filters sensitive cookies', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({
      cookies: { theme: 'dark', 'connect.sid': 'secret', session_token: 'secret' },
    });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toMatchObject({
      'http.request.header.cookie.theme': 'dark',
      'http.request.header.cookie.connect.sid': '[Filtered]',
      'http.request.header.cookie.session_token': '[Filtered]',
    });
  });

  it('applies request body data', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({ data: { key: 'value' } });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toMatchObject({
      'http.request.body.data': '{"key":"value"}',
    });
  });

  it('handles query_string in object format', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({ query_string: { page: '1', limit: '10' } });

    integration.processSegmentSpan!(span, mockClient(false));

    expect(span.attributes).toMatchObject({
      'url.query': 'page=1&limit=10',
    });
  });

  describe('respects include options', () => {
    it('excludes url when include.url is false', () => {
      const integration = requestDataIntegration({ include: { url: false } });
      const span = makeSpan();

      mockIsolationScope({ url: 'https://example.com', method: 'GET' });

      integration.processSegmentSpan!(span, mockClient(false));

      expect(span.attributes).not.toHaveProperty('url.full');
      expect(span.attributes).toMatchObject({ 'http.request.method': 'GET' });
    });

    it('excludes headers when include.headers is false', () => {
      const integration = requestDataIntegration({ include: { headers: false } });
      const span = makeSpan();

      mockIsolationScope({
        url: 'https://example.com',
        headers: { 'content-type': 'application/json' },
      });

      integration.processSegmentSpan!(span, mockClient(false));

      expect(span.attributes).not.toHaveProperty('http.request.header.content_type');
    });

    it('strips cookie header when include.cookies is false', () => {
      const integration = requestDataIntegration({ include: { cookies: false } });
      const span = makeSpan();

      mockIsolationScope({
        headers: { 'content-type': 'application/json', cookie: 'theme=dark' },
      });

      integration.processSegmentSpan!(span, mockClient(false));

      expect(span.attributes).toMatchObject({
        'http.request.header.content_type': 'application/json',
      });
      expect(span.attributes).not.toHaveProperty('http.request.header.cookie.theme');
    });

    it('strips IP headers when include.ip is false', () => {
      const integration = requestDataIntegration({ include: { ip: false } });
      const span = makeSpan();

      mockIsolationScope({
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.50' },
      });

      integration.processSegmentSpan!(span, mockClient(false));

      expect(span.attributes).toMatchObject({
        'http.request.header.content_type': 'application/json',
      });
      expect(span.attributes).not.toHaveProperty('http.request.header.x_forwarded_for');
      expect(span.attributes).not.toHaveProperty('user.ip_address');
    });

    it('excludes data when include.data is false', () => {
      const integration = requestDataIntegration({ include: { data: false } });
      const span = makeSpan();

      mockIsolationScope({ url: 'https://example.com', data: { key: 'value' } });

      integration.processSegmentSpan!(span, mockClient(false));

      expect(span.attributes).not.toHaveProperty('http.request.body.data');
    });

    it('excludes query_string when include.query_string is false', () => {
      const integration = requestDataIntegration({ include: { query_string: false } });
      const span = makeSpan();

      mockIsolationScope({ url: 'https://example.com', query_string: 'page=1' });

      integration.processSegmentSpan!(span, mockClient(false));

      expect(span.attributes).not.toHaveProperty('url.query');
    });

    it('include.ip overrides dataCollection.userInfo=false on spans', () => {
      const integration = requestDataIntegration({ include: { ip: true } });
      const span = makeSpan();

      mockIsolationScope({ headers: { 'x-forwarded-for': '203.0.113.50' } });

      integration.processSegmentSpan!(span, mockClient(false, { userInfo: false }));

      expect(span.attributes?.['user.ip_address']).toBe('203.0.113.50');
    });

    it('include.headers overrides dataCollection.httpHeaders.request=false on spans', () => {
      const integration = requestDataIntegration({ include: { headers: true } });
      const span = makeSpan();

      mockIsolationScope({
        headers: { 'content-type': 'application/json', accept: 'text/html' },
      });

      integration.processSegmentSpan!(span, mockClient(false, { httpHeaders: { request: false, response: false } }));

      expect(span.attributes).toMatchObject({
        'http.request.header.content_type': 'application/json',
        'http.request.header.accept': 'text/html',
      });
    });

    it('preserves configured header filtering when include.headers is true on spans', () => {
      const integration = requestDataIntegration({ include: { headers: true } });
      const span = makeSpan();

      mockIsolationScope({ headers: { accept: 'application/json', 'x-request-id': 'req-123' } });

      integration.processSegmentSpan!(
        span,
        mockClient(false, { httpHeaders: { request: { allow: ['accept'] }, response: true } }),
      );

      expect(span.attributes?.['http.request.header.accept']).toBe('application/json');
      expect(span.attributes?.['http.request.header.x_request_id']).toBe('[Filtered]');
    });

    it('include.cookies overrides dataCollection.cookies=false on spans', () => {
      const integration = requestDataIntegration({ include: { cookies: true } });
      const span = makeSpan();

      mockIsolationScope({
        cookies: { theme: 'dark', locale: 'en' },
      });

      integration.processSegmentSpan!(span, mockClient(false, { cookies: false }));

      expect(span.attributes).toMatchObject({
        'http.request.header.cookie.theme': 'dark',
        'http.request.header.cookie.locale': 'en',
      });
    });

    it('preserves configured cookie filtering when include.cookies is true on spans', () => {
      const integration = requestDataIntegration({ include: { cookies: true } });
      const span = makeSpan();

      mockIsolationScope({ cookies: { theme: 'dark', locale: 'en', session: 'secret' } });

      integration.processSegmentSpan!(span, mockClient(false, { cookies: { allow: ['theme'] } }));

      expect(span.attributes?.['http.request.header.cookie.theme']).toBe('dark');
      expect(span.attributes?.['http.request.header.cookie.locale']).toBe('[Filtered]');
      expect(span.attributes?.['http.request.header.cookie.session']).toBe('[Filtered]');
    });

    it('filters query params when include.query_string overrides dataCollection.urlQueryParams=false on spans', () => {
      const integration = requestDataIntegration({ include: { query_string: true } });
      const span = makeSpan();

      mockIsolationScope({ query_string: 'page=1&token=secret' });

      integration.processSegmentSpan!(span, mockClient(false, { urlQueryParams: false }));

      expect(span.attributes?.['url.query']).toBe('page=1&token=[Filtered]');
    });
  });
});

describe('requestDataIntegration legacy sendDefaultPii bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeSpan(overrides: Partial<StreamedSpanJSON> = {}): StreamedSpanJSON {
    return {
      name: 'GET /test',
      span_id: 'abc123',
      trace_id: 'def456',
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
      is_segment: true,
      attributes: {},
      ...overrides,
    };
  }

  function mockIsolationScope(normalizedRequest: Record<string, unknown>, ipAddress?: string): void {
    vi.spyOn(currentScopes, 'getIsolationScope').mockReturnValue({
      getScopeData: () => ({
        sdkProcessingMetadata: { normalizedRequest, ipAddress },
      }),
    } as ReturnType<typeof currentScopes.getIsolationScope>);
  }

  it('sendDefaultPii: true bridges to userInfo: true and includes IP on events', () => {
    const integration = requestDataIntegration();
    const event = baseEvent();

    integration.processEvent?.(event, {}, mockClient(true));

    expect(event.user?.ip_address).toBe('192.168.1.1');
    expect(event.request?.headers?.['X-Forwarded-For']).toBe('192.168.1.1');
  });

  it('sendDefaultPii: true bridges to userInfo: true and includes IP on spans', () => {
    const integration = requestDataIntegration();
    const span = makeSpan();

    mockIsolationScope({
      url: 'https://example.com',
      headers: { 'x-forwarded-for': '203.0.113.50', 'content-type': 'application/json' },
    });

    integration.processSegmentSpan!(span, mockClient(true));

    expect(span.attributes).toMatchObject({
      'user.ip_address': '203.0.113.50',
      'http.request.header.content_type': 'application/json',
      'http.request.header.x_forwarded_for': '203.0.113.50',
    });
  });
});
