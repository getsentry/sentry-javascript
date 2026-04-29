import { describe, expect, it } from 'vitest';
import type { Client } from '../../../src/client';
import { requestDataIntegration } from '../../../src/integrations/requestdata';
import type { Event } from '../../../src/types-hoist/event';
import { ipHeaderNames } from '../../../src/vendor/getIpAddress';

function mockClient(sendDefaultPii: boolean | undefined): Client {
  return {
    getOptions: () => ({ sendDefaultPii: sendDefaultPii as boolean | undefined }),
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
    it('removes known IP headers from event.request.headers when sendDefaultPii is false', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
      });
    });

    it('removes every ipHeaderNames entry when sendDefaultPii is false', () => {
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

    it('keeps IP headers on event.request.headers when sendDefaultPii is true', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
        'X-Forwarded-For': '192.168.1.1',
        'CF-Connecting-IP': '10.0.0.2',
      });
    });

    it('keeps IP headers when include.ip is true even if sendDefaultPii is false', () => {
      const integration = requestDataIntegration({ include: { ip: true } });
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers?.['X-Forwarded-For']).toBe('192.168.1.1');
    });

    it('strips IP headers when include.ip is false even if sendDefaultPii is true', () => {
      const integration = requestDataIntegration({ include: { ip: false } });
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.request?.headers).toEqual({ Host: 'example.com' });
    });

    it('removes every ipHeaderNames entry when keys use lowercase spelling and sendDefaultPii is false', () => {
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

    it('keeps lowercase IP headers on event.request.headers when sendDefaultPii is true', () => {
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
    it('does not set user.ip_address when sendDefaultPii is false', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.user?.ip_address).toBeUndefined();
    });

    it('sets user.ip_address from request headers when sendDefaultPii is true', () => {
      const integration = requestDataIntegration();
      const event = baseEvent();

      integration.processEvent?.(event, {}, mockClient(true));

      expect(event.user?.ip_address).toBe('192.168.1.1');
    });

    it('sets user.ip_address from lowercase IP headers when sendDefaultPii is true', () => {
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

    it('does not set user.ip_address from sdkProcessingMetadata when sendDefaultPii is false', () => {
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

    it('with include.headers false, still sets user.ip_address from original headers when sendDefaultPii is true', () => {
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

    it('uses normalizedRequest.cookies when set', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://example.com/',
            headers: { Host: 'example.com' },
            cookies: { session_id: 'abc' },
          },
        },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.cookies).toEqual({ session_id: 'abc' });
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
    it('with default include and sendDefaultPii true, copies method, url, query_string, data, headers, cookies, and user IP', () => {
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
          cookie: 'session=from-header',
          'X-Forwarded-For': '192.168.1.1',
          'X-Custom': 'keep',
        },
        cookies: { session: 'from-header' },
      });
      expect(event.user?.ip_address).toBe('192.168.1.1');
    });

    it('with default include and sendDefaultPii false, keeps non-IP fields and strips IP from headers and user', () => {
      const integration = requestDataIntegration();
      const event: Event = {
        sdkProcessingMetadata: { normalizedRequest: richNormalizedRequest() },
      };

      integration.processEvent?.(event, {}, mockClient(false));

      expect(event.request?.headers).toEqual({
        Host: 'example.com',
        cookie: 'session=from-header',
        'X-Custom': 'keep',
      });
      expect(event.request?.cookies).toEqual({ session: 'from-header' });
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
