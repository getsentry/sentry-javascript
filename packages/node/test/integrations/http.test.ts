import * as sentryCore from '@sentry/core';
import { Hub } from '@sentry/hub';
import * as hubModule from '@sentry/hub';
import { addExtensionMethods, SENTRY_TRACE_REGEX, Span, Transaction } from '@sentry/tracing';
import * as http from 'http';
import * as nock from 'nock';

import { NodeClient } from '../../src/client';
import { Http as HttpIntegration } from '../../src/integrations/http';

describe('tracing', () => {
  function createTransactionOnScope() {
    const hub = new Hub(
      new NodeClient({
        dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
        tracesSampleRate: 1.0,
        integrations: [new HttpIntegration({ tracing: true })],
      }),
    );
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
    nock('http://dogs.are.great')
      .get('/')
      .reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as Span).spanRecorder?.spans as Span[];

    http.get('http://dogs.are.great/');

    // TODO: For some reason in node 6 two request spans are appearing. Once we stop testing against it, this can go
    // back to being `toEqual()`.
    expect(spans.length).toBeGreaterThanOrEqual(2);

    // our span is at index 1 because the transaction itself is at index 0
    expect(spans[1].description).toEqual('GET http://dogs.are.great/');
    expect(spans[1].op).toEqual('request');
  });

  it("doesn't create a span for outgoing sentry requests", () => {
    nock('http://squirrelchasers.ingest.sentry.io')
      .get('/api/12312012/store/')
      .reply(200);

    const transaction = createTransactionOnScope();
    const spans = (transaction as Span).spanRecorder?.spans as Span[];

    http.get('http://squirrelchasers.ingest.sentry.io/api/12312012/store/');

    // only the transaction itself should be there
    expect(spans.length).toEqual(1);
    expect((spans[0] as Transaction).name).toEqual('dogpark');
  });

  it('attaches tracing headers to outgoing non-sentry requests', async () => {
    nock('http://dogs.are.great')
      .get('/')
      .reply(200);

    createTransactionOnScope();

    const request = http.get('http://dogs.are.great/');
    const sentryTraceHeader = request.getHeader('sentry-trace');
    const tracestateHeader = request.getHeader('tracestate');

    expect(sentryTraceHeader).toBeDefined();
    expect(tracestateHeader).toBeDefined();
    expect(SENTRY_TRACE_REGEX.test(sentryTraceHeader as string)).toBe(true);
  });

  it("doesn't attach tracing headers to outgoing sentry requests", () => {
    nock('http://squirrelchasers.ingest.sentry.io')
      .get('/api/12312012/store/')
      .reply(200);

    createTransactionOnScope();

    const request = http.get('http://squirrelchasers.ingest.sentry.io/api/12312012/store/');
    const sentryTraceHeader = request.getHeader('sentry-trace');
    const tracestateHeader = request.getHeader('tracestate');

    expect(sentryTraceHeader).not.toBeDefined();
    expect(tracestateHeader).not.toBeDefined();
  });
});
