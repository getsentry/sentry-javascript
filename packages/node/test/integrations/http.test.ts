import * as sentryCore from '@sentry/core';
import * as hubModule from '@sentry/hub';
import { Hub } from '@sentry/hub';
import { addExtensionMethods, Span, TRACEPARENT_REGEXP, Transaction } from '@sentry/tracing';
import { parseSemver } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';
import * as HttpsProxyAgent from 'https-proxy-agent';
import * as nock from 'nock';

import { Breadcrumb } from '../../src';
import { NodeClient } from '../../src/client';
import { Http as HttpIntegration } from '../../src/integrations/http';
import { setupNodeTransport } from '../../src/transports';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';

const NODE_VERSION = parseSemver(process.versions.node);

describe('tracing', () => {
  function createTransactionOnScope() {
    const options = getDefaultNodeClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
      integrations: [new HttpIntegration({ tracing: true })],
    });
    const hub = new Hub(new NodeClient(options, setupNodeTransport(options).transport));
    addExtensionMethods();

    // we need to mock both of these because the tracing handler relies on `@sentry/core` while the sampler relies on
    // `@sentry/hub`, and mocking breaks the link between the two
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    jest.spyOn(hubModule, 'getCurrentHub').mockReturnValue(hub);

    const transaction = hub.startTransaction({ name: 'dogpark' });
    hub.getScope()?.setSpan(transaction);

    return transaction;
  }

  it("creates a span for each outgoing non-sentry request when there's a transaction on the scope", () => {
    nock('http://dogs.are.great').get('/').reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as Span).spanRecorder?.spans as Span[];

    http.get('http://dogs.are.great/');

    expect(spans.length).toEqual(2);

    // our span is at index 1 because the transaction itself is at index 0
    expect(spans[1].description).toEqual('GET http://dogs.are.great/');
    expect(spans[1].op).toEqual('http.client');
  });

  it("doesn't create a span for outgoing sentry requests", () => {
    nock('http://squirrelchasers.ingest.sentry.io').get('/api/12312012/store/').reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as Span).spanRecorder?.spans as Span[];

    http.get('http://squirrelchasers.ingest.sentry.io/api/12312012/store/');

    // only the transaction itself should be there
    expect(spans.length).toEqual(1);
    expect((spans[0] as Transaction).name).toEqual('dogpark');
  });

  it('attaches the sentry-trace header to outgoing non-sentry requests', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    createTransactionOnScope();

    const request = http.get('http://dogs.are.great/');
    const sentryTraceHeader = request.getHeader('sentry-trace') as string;

    expect(sentryTraceHeader).toBeDefined();
    expect(TRACEPARENT_REGEXP.test(sentryTraceHeader)).toBe(true);
  });

  it("doesn't attach the sentry-trace header to outgoing sentry requests", () => {
    nock('http://squirrelchasers.ingest.sentry.io').get('/api/12312012/store/').reply(200);

    createTransactionOnScope();

    const request = http.get('http://squirrelchasers.ingest.sentry.io/api/12312012/store/');
    const sentryTraceHeader = request.getHeader('sentry-trace');

    expect(sentryTraceHeader).not.toBeDefined();
  });
});

describe('default protocols', () => {
  function captureBreadcrumb(key: string): Promise<Breadcrumb> {
    const hub = new Hub();
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    let resolve: (value: Breadcrumb | PromiseLike<Breadcrumb>) => void;
    const p = new Promise<Breadcrumb>(r => {
      resolve = r;
    });
    const options = getDefaultNodeClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      integrations: [new HttpIntegration({ breadcrumbs: true })],
      beforeBreadcrumb: (b: Breadcrumb) => {
        if ((b.data?.url as string).includes(key)) {
          resolve(b);
        }
        return b;
      },
    });
    hub.bindClient(new NodeClient(options, setupNodeTransport(options).transport));

    return p;
  }

  it('http module', async () => {
    const key = 'catrunners';
    const p = captureBreadcrumb(key);

    nock(`http://${key}.ingest.sentry.io`).get('/api/123122332/store/').reply(200);

    http.get({
      host: `${key}.ingest.sentry.io`,
      path: '/api/123122332/store/',
    });

    const b = await p;
    expect(b.data?.url).toEqual(expect.stringContaining('http://'));
  });

  it('https module', async () => {
    const key = 'catcatchers';
    const p = captureBreadcrumb(key);

    let nockProtocol = 'https';
    // NOTE: Prior to Node 9, `https` used internals of `http` module, so
    // the integration doesn't patch the `https` module. However this then
    // causes issues with nock, because nock will patch the `https` module
    // regardless (if it asked to mock a https:// url), preventing the
    // request from reaching the integrations patch of the `http` module.
    // The result is test failures in Node v8 and lower.
    //
    // We can work around this by telling giving nock a http:// url, so it
    // only patches the `http` module, then Nodes usage of the `http` module
    // in the `https` module results in both nock's and the integrations
    // patch being called. All this relies on nock not properly checking
    // the agent passed to `http.get` / `http.request`, thus resulting in it
    // intercepting a https:// request with http:// mock. It's a safe bet
    // because the latest versions of nock no longer support Node v8 and lower,
    // so won't bother dealing with this old Node edge case.
    if (NODE_VERSION.major && NODE_VERSION.major < 9) {
      nockProtocol = 'http';
    }
    nock(`${nockProtocol}://${key}.ingest.sentry.io`).get('/api/123122332/store/').reply(200);

    https.get({
      host: `${key}.ingest.sentry.io`,
      path: '/api/123122332/store/',
      timeout: 300,
    });

    const b = await p;
    expect(b.data?.url).toEqual(expect.stringContaining('https://'));
  });

  it('makes https request over http proxy', async () => {
    const key = 'catcatchers';
    const p = captureBreadcrumb(key);
    let nockProtocol = 'https';

    const proxy = 'http://<PROXY_URL>:3128';
    const agent = HttpsProxyAgent(proxy);

    if (NODE_VERSION.major && NODE_VERSION.major < 9) {
      nockProtocol = 'http';
    }

    nock(`${nockProtocol}://${key}.ingest.sentry.io`).get('/api/123122332/store/').reply(200);

    https.get({
      host: `${key}.ingest.sentry.io`,
      path: '/api/123122332/store/',
      timeout: 300,
      agent,
    });

    const b = await p;
    expect(b.data?.url).toEqual(expect.stringContaining('https://'));
  });
});
