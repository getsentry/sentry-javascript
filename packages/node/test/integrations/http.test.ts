import type { Span, Transaction } from '@sentry/core';
import * as sentryCore from '@sentry/core';
import { addTracingExtensions, Hub } from '@sentry/core';
import type { TransactionContext } from '@sentry/types';
import { logger, TRACEPARENT_REGEXP } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';
import * as HttpsProxyAgent from 'https-proxy-agent';
import * as nock from 'nock';

import type { Breadcrumb } from '../../src';
import { NodeClient } from '../../src/client';
import { Http as HttpIntegration } from '../../src/integrations/http';
import { NODE_VERSION } from '../../src/nodeVersion';
import type { NodeClientOptions } from '../../src/types';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';

const originalHttpGet = http.get;
const originalHttpRequest = http.request;

describe('tracing', () => {
  function createTransactionOnScope(
    customOptions: Partial<NodeClientOptions> = {},
    customContext?: Partial<TransactionContext>,
  ) {
    const options = getDefaultNodeClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
      integrations: [new HttpIntegration({ tracing: true })],
      release: '1.0.0',
      environment: 'production',
      ...customOptions,
    });
    const hub = new Hub(new NodeClient(options));
    addTracingExtensions();

    hub.configureScope(scope =>
      scope.setUser({
        id: 'uid123',
        segment: 'segmentA',
      }),
    );

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    const transaction = hub.startTransaction({
      name: 'dogpark',
      traceId: '12312012123120121231201212312012',
      ...customContext,
    });

    hub.getScope().setSpan(transaction);

    return transaction;
  }

  function getHub(customOptions: Partial<NodeClientOptions> = {}) {
    const options = getDefaultNodeClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
      integrations: [new HttpIntegration({ tracing: true })],
      release: '1.0.0',
      environment: 'production',
      ...customOptions,
    });
    const hub = new Hub(new NodeClient(options));
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    return hub;
  }

  it("creates a span for each outgoing non-sentry request when there's a transaction on the scope", () => {
    nock('http://dogs.are.great').get('/').reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as unknown as Span).spanRecorder?.spans as Span[];

    http.get('http://dogs.are.great/');

    expect(spans.length).toEqual(2);

    // our span is at index 1 because the transaction itself is at index 0
    expect(spans[1].description).toEqual('GET http://dogs.are.great/');
    expect(spans[1].op).toEqual('http.client');
  });

  it("doesn't create a span for outgoing sentry requests", () => {
    nock('http://squirrelchasers.ingest.sentry.io').get('/api/12312012/store/').reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as unknown as Span).spanRecorder?.spans as Span[];

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

  it('attaches the baggage header to outgoing non-sentry requests', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    createTransactionOnScope();

    const request = http.get('http://dogs.are.great/');
    const baggageHeader = request.getHeader('baggage') as string;

    expect(baggageHeader).toEqual(
      'sentry-environment=production,sentry-release=1.0.0,' +
        'sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,' +
        'sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=1,' +
        'sentry-transaction=dogpark,sentry-sampled=true',
    );
  });

  it('keeps 3rd party baggage header data to outgoing non-sentry requests', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    createTransactionOnScope();

    const request = http.get({ host: 'http://dogs.are.great/', headers: { baggage: 'dog=great' } });
    const baggageHeader = request.getHeader('baggage') as string;

    expect(baggageHeader[0]).toEqual('dog=great');
    expect(baggageHeader[1]).toEqual(
      'sentry-environment=production,sentry-release=1.0.0,sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=1,sentry-transaction=dogpark,sentry-sampled=true',
    );
  });

  it('adds the transaction name to the the baggage header if a valid transaction source is set', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    createTransactionOnScope({}, { metadata: { source: 'route' } });

    const request = http.get({ host: 'http://dogs.are.great/', headers: { baggage: 'dog=great' } });
    const baggageHeader = request.getHeader('baggage') as string;

    expect(baggageHeader).toEqual([
      'dog=great',
      'sentry-environment=production,sentry-release=1.0.0,sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=1,sentry-transaction=dogpark,sentry-sampled=true',
    ]);
  });

  it('does not add the transaction name to the the baggage header if url transaction source is set', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    createTransactionOnScope({}, { metadata: { source: 'url' } });

    const request = http.get({ host: 'http://dogs.are.great/', headers: { baggage: 'dog=great' } });
    const baggageHeader = request.getHeader('baggage') as string;

    expect(baggageHeader).toEqual([
      'dog=great',
      'sentry-environment=production,sentry-release=1.0.0,sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=1,sentry-sampled=true',
    ]);
  });

  it('generates and uses propagation context to attach baggage and sentry-trace header', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    const request = http.get('http://dogs.are.great/');
    const sentryTraceHeader = request.getHeader('sentry-trace') as string;
    const baggageHeader = request.getHeader('baggage') as string;

    const parts = sentryTraceHeader.split('-');
    expect(parts.length).toEqual(3);
    expect(parts[0]).toEqual('12312012123120121231201212312012');
    expect(parts[1]).toEqual(expect.any(String));
    expect(parts[2]).toEqual('1');

    expect(baggageHeader).toEqual(
      'sentry-environment=production,sentry-release=1.0.0,sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=1,sentry-sampled=true',
    );
  });

  it('uses incoming propagation context to attach baggage and sentry-trace', async () => {
    nock('http://dogs.are.great').get('/').reply(200);

    const hub = getHub();
    hub.getScope().setPropagationContext({
      traceId: '86f39e84263a4de99c326acab3bfe3bd',
      spanId: '86f39e84263a4de9',
      sampled: true,
      dsc: {
        trace_id: '86f39e84263a4de99c326acab3bfe3bd',
        public_key: 'test-public-key',
      },
    });

    const request = http.get('http://dogs.are.great/');
    const sentryTraceHeader = request.getHeader('sentry-trace') as string;
    const baggageHeader = request.getHeader('baggage') as string;

    const parts = sentryTraceHeader.split('-');
    expect(parts.length).toEqual(3);
    expect(parts[0]).toEqual('86f39e84263a4de99c326acab3bfe3bd');
    expect(parts[1]).toEqual(expect.any(String));
    expect(parts[2]).toEqual('1');

    expect(baggageHeader).toEqual('sentry-trace_id=86f39e84263a4de99c326acab3bfe3bd,sentry-public_key=test-public-key');
  });

  it("doesn't attach the sentry-trace header to outgoing sentry requests", () => {
    nock('http://squirrelchasers.ingest.sentry.io').get('/api/12312012/store/').reply(200);

    createTransactionOnScope();

    const request = http.get('http://squirrelchasers.ingest.sentry.io/api/12312012/store/');
    const baggage = request.getHeader('baggage');

    expect(baggage).not.toBeDefined();
  });

  it("doesn't attach when using otel instrumenter", () => {
    const loggerLogSpy = jest.spyOn(logger, 'log');

    const options = getDefaultNodeClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
      integrations: [new HttpIntegration({ tracing: true })],
      release: '1.0.0',
      environment: 'production',
      instrumenter: 'otel',
    });
    const hub = new Hub(new NodeClient(options));

    const integration = new HttpIntegration();
    integration.setupOnce(
      () => {},
      () => hub,
    );

    expect(loggerLogSpy).toBeCalledWith('HTTP Integration is skipped because of instrumenter configuration.');
  });

  it('omits query and fragment from description and adds to span data instead', () => {
    nock('http://dogs.are.great').get('/spaniel?tail=wag&cute=true#learn-more').reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as unknown as Span).spanRecorder?.spans as Span[];

    http.get('http://dogs.are.great/spaniel?tail=wag&cute=true#learn-more');

    expect(spans.length).toEqual(2);

    // our span is at index 1 because the transaction itself is at index 0
    expect(spans[1].description).toEqual('GET http://dogs.are.great/spaniel');
    expect(spans[1].op).toEqual('http.client');
    expect(spans[1].data['http.method']).toEqual('GET');
    expect(spans[1].data.url).toEqual('http://dogs.are.great/spaniel');
    expect(spans[1].data['http.query']).toEqual('tail=wag&cute=true');
    expect(spans[1].data['http.fragment']).toEqual('learn-more');
  });

  it.each([
    ['user:pwd', '[Filtered]:[Filtered]@'],
    ['user:', '[Filtered]:@'],
    ['user', '[Filtered]:@'],
    [':pwd', ':[Filtered]@'],
    ['', ''],
  ])('filters the authority %s in span description', (auth, redactedAuth) => {
    nock(`http://${auth}@dogs.are.great`).get('/').reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as unknown as Span).spanRecorder?.spans as Span[];

    http.get(`http://${auth}@dogs.are.great/`);

    expect(spans.length).toEqual(2);

    // our span is at index 1 because the transaction itself is at index 0
    expect(spans[1].description).toEqual(`GET http://${redactedAuth}dogs.are.great/`);
  });

  describe('Tracing options', () => {
    beforeEach(() => {
      // hacky way of restoring monkey patched functions
      // @ts-ignore TS doesn't let us assign to this but we want to
      http.get = originalHttpGet;
      // @ts-ignore TS doesn't let us assign to this but we want to
      http.request = originalHttpRequest;
    });

    function createHub(customOptions: Partial<NodeClientOptions> = {}) {
      const options = getDefaultNodeClientOptions({
        dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
        tracesSampleRate: 1.0,
        release: '1.0.0',
        environment: 'production',
        ...customOptions,
      });

      const hub = new Hub();

      jest.spyOn(sentryCore, 'getCurrentHub').mockImplementation(() => hub);

      const client = new NodeClient(options);
      jest.spyOn(hub, 'getClient').mockImplementation(() => client);
      hub.bindClient(client);

      return hub;
    }

    function createTransactionAndPutOnScope(hub: Hub) {
      addTracingExtensions();
      const transaction = hub.startTransaction({ name: 'dogpark' });
      hub.getScope().setSpan(transaction);
      return transaction;
    }

    describe('as client options', () => {
      it('creates span with propagation context if shouldCreateSpanForRequest returns false', () => {
        const url = 'http://dogs.are.great/api/v1/index/';
        nock(url).get(/.*/).reply(200);

        const httpIntegration = new HttpIntegration({ tracing: true });

        const hub = createHub({ shouldCreateSpanForRequest: () => false });

        httpIntegration.setupOnce(
          () => undefined,
          () => hub,
        );

        const transaction = createTransactionAndPutOnScope(hub);
        const spans = (transaction as unknown as Span).spanRecorder?.spans as Span[];

        const request = http.get(url);

        // There should be no http spans
        const httpSpans = spans.filter(span => span.op?.startsWith('http'));
        expect(httpSpans.length).toBe(0);

        // And headers are not attached without span creation
        expect(request.getHeader('sentry-trace')).toBeDefined();
        expect(request.getHeader('baggage')).toBeDefined();

        const propagationContext = hub.getScope().getPropagationContext();

        expect((request.getHeader('sentry-trace') as string).includes(propagationContext.traceId)).toBe(true);
        expect(request.getHeader('baggage')).toEqual(
          `sentry-environment=production,sentry-release=1.0.0,sentry-public_key=dogsarebadatkeepingsecrets,sentry-trace_id=${propagationContext.traceId}`,
        );
      });

      it.each([
        ['http://dogs.are.great/api/v1/index/', [/.*/]],
        ['http://dogs.are.great/api/v1/index/', [/\/api/]],
        ['http://dogs.are.great/api/v1/index/', [/\/(v1|v2)/]],
        ['http://dogs.are.great/api/v1/index/', [/dogs\.are\.great/, /dogs\.are\.not\.great/]],
        ['http://dogs.are.great/api/v1/index/', [/http:/]],
        ['http://dogs.are.great/api/v1/index/', ['dogs.are.great']],
        ['http://dogs.are.great/api/v1/index/', ['/api/v1']],
        ['http://dogs.are.great/api/v1/index/', ['http://']],
        ['http://dogs.are.great/api/v1/index/', ['']],
      ])(
        'attaches trace inforation to header of outgoing requests when url matches tracePropagationTargets (url="%s", tracePropagationTargets=%p)',
        (url, tracePropagationTargets) => {
          nock(url).get(/.*/).reply(200);

          const httpIntegration = new HttpIntegration({ tracing: true });

          const hub = createHub({ tracePropagationTargets });

          httpIntegration.setupOnce(
            () => undefined,
            () => hub,
          );

          createTransactionAndPutOnScope(hub);

          const request = http.get(url);

          expect(request.getHeader('sentry-trace')).toBeDefined();
          expect(request.getHeader('baggage')).toBeDefined();
        },
      );

      it.each([
        ['http://dogs.are.great/api/v1/index/', []],
        ['http://cats.are.great/api/v1/index/', [/\/v2/]],
        ['http://cats.are.great/api/v1/index/', [/\/(v2|v3)/]],
        ['http://cats.are.great/api/v1/index/', [/dogs\.are\.great/, /dogs\.are\.not\.great/]],
        ['http://cats.are.great/api/v1/index/', [/https:/]],
        ['http://cats.are.great/api/v1/index/', ['dogs.are.great']],
        ['http://cats.are.great/api/v1/index/', ['/api/v2']],
        ['http://cats.are.great/api/v1/index/', ['https://']],
      ])(
        'doesn\'t attach trace inforation to header of outgoing requests when url doesn\'t match tracePropagationTargets (url="%s", tracePropagationTargets=%p)',
        (url, tracePropagationTargets) => {
          nock(url).get(/.*/).reply(200);

          const httpIntegration = new HttpIntegration({ tracing: true });

          const hub = createHub({ tracePropagationTargets });

          httpIntegration.setupOnce(
            () => undefined,
            () => hub,
          );

          createTransactionAndPutOnScope(hub);

          const request = http.get(url);

          expect(request.getHeader('sentry-trace')).not.toBeDefined();
          expect(request.getHeader('baggage')).not.toBeDefined();
        },
      );
    });

    describe('as Http integration constructor options', () => {
      it('creates span with propagation context if shouldCreateSpanForRequest returns false', () => {
        const url = 'http://dogs.are.great/api/v1/index/';
        nock(url).get(/.*/).reply(200);

        const httpIntegration = new HttpIntegration({
          tracing: {
            shouldCreateSpanForRequest: () => false,
          },
        });

        const hub = createHub();

        httpIntegration.setupOnce(
          () => undefined,
          () => hub,
        );

        const transaction = createTransactionAndPutOnScope(hub);
        const spans = (transaction as unknown as Span).spanRecorder?.spans as Span[];

        const request = http.get(url);

        // There should be no http spans
        const httpSpans = spans.filter(span => span.op?.startsWith('http'));
        expect(httpSpans.length).toBe(0);

        // And headers are not attached without span creation
        expect(request.getHeader('sentry-trace')).toBeDefined();
        expect(request.getHeader('baggage')).toBeDefined();

        const propagationContext = hub.getScope().getPropagationContext();

        expect((request.getHeader('sentry-trace') as string).includes(propagationContext.traceId)).toBe(true);
        expect(request.getHeader('baggage')).toEqual(
          `sentry-environment=production,sentry-release=1.0.0,sentry-public_key=dogsarebadatkeepingsecrets,sentry-trace_id=${propagationContext.traceId}`,
        );
      });

      it.each([
        ['http://dogs.are.great/api/v1/index/', [/.*/]],
        ['http://dogs.are.great/api/v1/index/', [/\/api/]],
        ['http://dogs.are.great/api/v1/index/', [/\/(v1|v2)/]],
        ['http://dogs.are.great/api/v1/index/', [/dogs\.are\.great/, /dogs\.are\.not\.great/]],
        ['http://dogs.are.great/api/v1/index/', [/http:/]],
        ['http://dogs.are.great/api/v1/index/', ['dogs.are.great']],
        ['http://dogs.are.great/api/v1/index/', ['/api/v1']],
        ['http://dogs.are.great/api/v1/index/', ['http://']],
        ['http://dogs.are.great/api/v1/index/', ['']],
      ])(
        'attaches trace inforation to header of outgoing requests when url matches tracePropagationTargets (url="%s", tracePropagationTargets=%p)',
        (url, tracePropagationTargets) => {
          nock(url).get(/.*/).reply(200);

          const httpIntegration = new HttpIntegration({ tracing: { tracePropagationTargets } });

          const hub = createHub();

          httpIntegration.setupOnce(
            () => undefined,
            () => hub,
          );

          createTransactionAndPutOnScope(hub);

          const request = http.get(url);

          expect(request.getHeader('sentry-trace')).toBeDefined();
          expect(request.getHeader('baggage')).toBeDefined();
        },
      );

      it.each([
        ['http://dogs.are.great/api/v1/index/', []],
        ['http://cats.are.great/api/v1/index/', [/\/v2/]],
        ['http://cats.are.great/api/v1/index/', [/\/(v2|v3)/]],
        ['http://cats.are.great/api/v1/index/', [/dogs\.are\.great/, /dogs\.are\.not\.great/]],
        ['http://cats.are.great/api/v1/index/', [/https:/]],
        ['http://cats.are.great/api/v1/index/', ['dogs.are.great']],
        ['http://cats.are.great/api/v1/index/', ['/api/v2']],
        ['http://cats.are.great/api/v1/index/', ['https://']],
      ])(
        'doesn\'t attach trace inforation to header of outgoing requests when url doesn\'t match tracePropagationTargets (url="%s", tracePropagationTargets=%p)',
        (url, tracePropagationTargets) => {
          nock(url).get(/.*/).reply(200);

          const httpIntegration = new HttpIntegration({ tracing: { tracePropagationTargets } });

          const hub = createHub();

          httpIntegration.setupOnce(
            () => undefined,
            () => hub,
          );

          createTransactionAndPutOnScope(hub);

          const request = http.get(url);

          expect(request.getHeader('sentry-trace')).not.toBeDefined();
          expect(request.getHeader('baggage')).not.toBeDefined();
        },
      );
    });
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
    hub.bindClient(new NodeClient(options));

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
