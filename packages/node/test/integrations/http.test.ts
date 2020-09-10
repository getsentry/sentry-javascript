import * as sentryCore from '@sentry/core';
import { Hub } from '@sentry/hub';
import * as dsn from 'dns';
import * as http from 'http';
import * as net from 'net';

import { NodeClient } from '../../src';
import { extractUrl, Http as httpIntegration } from './../../src/integrations/http';

// callng `http.request(url)` triggers a live DNS lookup, which we don't want
jest.spyOn(dsn, 'lookup').mockImplementation(() => {
  // we know our url is fake, so don't bother trying to do any DNS resolution - it'll just lead to errors
  return;
});

describe('extractUrl()', () => {
  const urlString = 'http://dogs.are.great:1231/yay/';
  const urlParts: http.RequestOptions = {
    protocol: 'http:',
    host: 'dogs.are.great',
    method: 'GET',
    path: '/yay/',
    port: 1231,
  };
  const queryString = '?furry=yes&funny=very';
  const fragment = '#adoptnotbuy';

  it('accepts a url string', () => {
    expect(extractUrl(urlString)).toBe(urlString);
  });

  it('accepts a http.RequestOptions object and returns a string with everything in the right place', () => {
    expect(extractUrl(urlParts)).toBe('http://dogs.are.great:1231/yay/');
  });

  it('strips query string from url string', () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(extractUrl(urlWithQueryString)).toBe(urlString);
  });

  it('strips query string from path in http.RequestOptions object', () => {
    const urlPartsWithQueryString = { ...urlParts, path: `${urlParts.path}${queryString}` };
    expect(extractUrl(urlPartsWithQueryString)).toBe(urlString);
  });

  it('strips fragment from url string', () => {
    const urlWithFragment = `${urlString}${fragment}`;
    expect(extractUrl(urlWithFragment)).toBe(urlString);
  });

  it('strips fragment from path in http.RequestOptions object', () => {
    const urlPartsWithFragment = { ...urlParts, path: `${urlParts.path}${fragment}` };
    expect(extractUrl(urlPartsWithFragment)).toBe(urlString);
  });

  it('strips query string and fragment from url string', () => {
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;
    expect(extractUrl(urlWithQueryStringAndFragment)).toBe(urlString);
  });

  it('strips query string and fragment from path in http.RequestOptions object', () => {
    const urlPartsWithQueryStringAndFragment = { ...urlParts, path: `${urlParts.path}${queryString}${fragment}` };
    expect(extractUrl(urlPartsWithQueryStringAndFragment)).toBe(urlString);
  });
});

describe('options', () => {
  // TODO (kmclb): In addition to having a few as-yet-unimplemented tests, this suffers from the problem of an
  // integration only going through the `setupOnce` process... once. If it bakes its options into whatever it sets up,
  // later instances will never have their options applied (since `setupOnce` won't run again), and they'll be stuck
  // with the first instances choices. Find a workaround or fix the original behavior.

  const url = 'http://sit.shake.rollover/good/dog';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.only('should capture breadcrumbs by default', () => {
    const hub = new Hub(
      new NodeClient({
        dsn: 'https://1231@dogs.are.great/1121',
        integrations: [new httpIntegration()],
      }),
    );
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    const req = http.request(url);
    req.emit('response');

    const breadcrumbs = (hub.getScope() as any)._breadcrumbs;
    expect(breadcrumbs).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'http', data: expect.objectContaining({ url }) })]),
    );
  });

  it.only('should not capture breadcrumbs if told not to', () => {
    const hub = new Hub(
      new NodeClient({
        dsn: 'https://1231@dogs.are.great/1121',
        integrations: [new httpIntegration({ breadcrumbs: false })],
      }),
    );
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    const req = http.request(url);
    req.emit('response');

    const breadcrumbs = (hub.getScope() as any)._breadcrumbs;
    expect(breadcrumbs.length).toBe(0);
  });

  it('should ignore Sentry requests when creating breadcrumbs', () => {
    const hub = new Hub(
      new NodeClient({
        dsn: 'https://1231@dogs.are.great/1121',
        integrations: [new httpIntegration()],
      }),
    );
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    const req = http.request('http://dogs.are.great');
    req.emit('response');

    const breadcrumbs = (hub.getScope() as any)._breadcrumbs;
    expect(breadcrumbs.length).toBe(0);
  });

  it('should not capture spans by default', () => {
    const hub = new Hub(
      new NodeClient({
        dsn: 'https://1231@dogs.are.great/1121',
        integrations: [new httpIntegration()],
      }),
    );
    const transaction = hub.startTransaction({ name: 'dogpark' });

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    const startChild = jest.spyOn(transaction, 'startChild');

    const req = http.request(url);
    req.emit('response');

    expect(startChild).not.toHaveBeenCalled();
  });

  // TODO (kmclb): This isn't yet working or complete. Need to figure out how to tie a mock response in. (Why are the
  // datatypes on the params in `.once('response', function callback(param1, param2) {...})` seemingly backwards?)
  it('should capture spans if told to do so', () => {
    const hub = new Hub(
      new NodeClient({
        dsn: 'https://1231@dogs.are.great/1121',
        integrations: [new httpIntegration({ tracing: true })],
      }),
    );
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    const transaction = hub.startTransaction({ name: 'dogpark', sampled: true });
    hub.getScope()?.setSpan(transaction);

    const startChild = jest.spyOn(transaction, 'startChild');

    const req = http.request(url);

    const res = new http.ServerResponse(new http.IncomingMessage(new net.Socket()));
    req.emit('response', res); // datatypes in callback?

    expect(startChild).toHaveBeenCalled();
    // expect transaction to have a span corresponding to this request
  });

  it('should apply given shouldCreateSpanForRequest', () => {
    // pass
  });

  it('should create a span if shouldCreateSpanForRequest says it should', () => {
    // pass
  });

  it("shouldn't create a span if shouldCreateSpanForRequest says not to", () => {
    // pass
  });

  it('should ignore Sentry requests when creating spans', () => {
    // pass
  });
});
