import { Session } from '@sentry/hub';
import * as https from 'https';
import * as HttpsProxyAgent from 'https-proxy-agent';

import { HTTPSTransport } from '../../src/transports/https';

const DSN = 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';
const HTTP_PROXY_URL = 'http://unsecure-example.com:8080';
const HTTPS_PROXY_URL = 'https://example.com:8080';

let eventToSentryRequestSpy: jest.SpyInstance;
let sessionToSentryRequestSpy: jest.SpyInstance;

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  eventToSentryRequestSpy = jest.spyOn(actual, 'eventToSentryRequest');
  sessionToSentryRequestSpy = jest.spyOn(actual, 'sessionToSentryRequest');
  return actual;
});

jest.mock('fs', () => ({
  readFileSync(): string {
    return 'mockedCert';
  },
}));

describe('HTTPSTransport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEvent/sendSession', () => {
    test('sendEvent calls BaseTransport._send with eventToSentryRequest', () => {
      const transport = new HTTPSTransport({
        dsn: DSN,
      });
      const event = {
        event_id: '1337',
      };
      // @ts-ignore those should be public methods/attributes, but we cannot easily change it now due to _ naming convention
      const sendSpy = jest.spyOn(HTTPSTransport.prototype, '_send').mockImplementationOnce(() => Promise.resolve());
      void transport.sendEvent(event);
      // @ts-ignore those should be public methods/attributes, but we cannot easily change it now due to _ naming convention
      expect(eventToSentryRequestSpy).toHaveBeenCalledWith(event, transport._api);
      expect(sendSpy).toHaveBeenCalled();
    });

    test('sendSession calls BaseTransport._send with sessionToSentryRequest', () => {
      const transport = new HTTPSTransport({
        dsn: DSN,
      });
      const session = new Session();
      // @ts-ignore those should be public methods/attributes, but we cannot easily change it now due to _ naming convention
      const sendSpy = jest.spyOn(HTTPSTransport.prototype, '_send').mockImplementationOnce(() => Promise.resolve());
      void transport.sendSession(session);
      // @ts-ignore those should be public methods/attributes, but we cannot easily change it now due to _ naming convention
      expect(sessionToSentryRequestSpy).toHaveBeenCalledWith(session, transport._api);
      expect(sendSpy).toHaveBeenCalled();
    });
  });

  describe('proxy', () => {
    test('can be configured through client option', async () => {
      const transport = new HTTPSTransport({
        dsn: DSN,
        httpsProxy: HTTPS_PROXY_URL,
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
    });

    test('can be configured through env variables option', async () => {
      process.env.https_proxy = HTTPS_PROXY_URL;
      const transport = new HTTPSTransport({
        dsn: DSN,
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
      delete process.env.https_proxy;
    });

    test('https proxies have priority in client option', async () => {
      const transport = new HTTPSTransport({
        dsn: DSN,
        httpProxy: HTTP_PROXY_URL,
        httpsProxy: HTTPS_PROXY_URL,
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
    });

    test('https proxies have priority in env variables', async () => {
      process.env.http_proxy = HTTP_PROXY_URL;
      process.env.https_proxy = HTTPS_PROXY_URL;
      const transport = new HTTPSTransport({
        dsn: DSN,
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
      delete process.env.http_proxy;
      delete process.env.https_proxy;
    });

    test('client options have priority over env variables', async () => {
      process.env.https_proxy = 'https://env-example.com:8080';
      const transport = new HTTPSTransport({
        dsn: DSN,
        httpsProxy: HTTPS_PROXY_URL,
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
      delete process.env.https_proxy;
    });

    test('no_proxy allows for skipping specific hosts', async () => {
      process.env.no_proxy = 'sentry.io';
      const transport = new HTTPSTransport({
        dsn: DSN,
        httpsProxy: HTTPS_PROXY_URL,
      });
      expect(transport.client).toBeInstanceOf(https.Agent);
    });

    test('no_proxy works with a port', async () => {
      process.env.https_proxy = HTTPS_PROXY_URL;
      process.env.no_proxy = 'sentry.io:8989';
      const transport = new HTTPSTransport({
        dsn: DSN,
      });
      expect(transport.client).toBeInstanceOf(https.Agent);
      delete process.env.https_proxy;
    });

    test('no_proxy works with multiple comma-separated hosts', async () => {
      process.env.http_proxy = HTTPS_PROXY_URL;
      process.env.no_proxy = 'example.com,sentry.io,wat.com:1337';
      const transport = new HTTPSTransport({
        dsn: DSN,
      });
      expect(transport.client).toBeInstanceOf(https.Agent);
      delete process.env.https_proxy;
    });

    test('can configure tls certificate through client option', async () => {
      const transport = new HTTPSTransport({
        caCerts: './some/path.pem',
        dsn: DSN,
      });
      const requestSpy = jest
        .spyOn(transport.module!, 'request')
        .mockImplementation((_options: any, callback: any) => ({
          end: () => {
            callback({
              on: jest.fn(),
              setEncoding: jest.fn(),
              statusCode: 200,
            });
          },
          on: jest.fn(),
        }));
      await transport.sendEvent({
        message: 'test',
      });
      const requestOptions = requestSpy.mock.calls[0][0] as { ca: string };
      expect(requestOptions.ca).toEqual('mockedCert');
    });
  });
});
