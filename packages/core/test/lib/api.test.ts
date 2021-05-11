import { Dsn } from '@sentry/utils';

import { API } from '../../src/api';

const ingestDsn = 'https://abc@xxxx.ingest.sentry.io:1234/subpath/123';
const dsnPublic = 'https://abc@sentry.io:1234/subpath/123';
const legacyDsn = 'https://abc:123@sentry.io:1234/subpath/123';
const envelopeTunnel = 'https://hello.com/world';

describe('API', () => {
  test('getStoreEndpoint', () => {
    expect(new API(dsnPublic).getStoreEndpointWithUrlEncodedAuth()).toEqual(
      'https://sentry.io:1234/subpath/api/123/store/?sentry_key=abc&sentry_version=7',
    );
    expect(new API(dsnPublic).getStoreEndpoint()).toEqual('https://sentry.io:1234/subpath/api/123/store/');
    expect(new API(ingestDsn).getStoreEndpoint()).toEqual('https://xxxx.ingest.sentry.io:1234/subpath/api/123/store/');
  });

  test('getEnvelopeEndpoint', () => {
    expect(new API(dsnPublic).getEnvelopeEndpointWithUrlEncodedAuth()).toEqual(
      'https://sentry.io:1234/subpath/api/123/envelope/?sentry_key=abc&sentry_version=7',
    );
    expect(new API(dsnPublic, {}, envelopeTunnel).getEnvelopeEndpointWithUrlEncodedAuth()).toEqual(envelopeTunnel);
  });

  test('getRequestHeaders', () => {
    expect(new API(dsnPublic).getRequestHeaders('a', '1.0')).toMatchObject({
      'Content-Type': 'application/json',
      'X-Sentry-Auth': expect.stringMatching(/^Sentry sentry_version=\d, sentry_client=a\/1\.0, sentry_key=abc$/),
    });

    expect(new API(legacyDsn).getRequestHeaders('a', '1.0')).toMatchObject({
      'Content-Type': 'application/json',
      'X-Sentry-Auth': expect.stringMatching(
        /^Sentry sentry_version=\d, sentry_client=a\/1\.0, sentry_key=abc, sentry_secret=123$/,
      ),
    });
  });

  test('getReportDialogEndpoint', () => {
    expect(new API(ingestDsn).getReportDialogEndpoint({})).toEqual(
      'https://xxxx.ingest.sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@xxxx.ingest.sentry.io:1234/subpath/123',
    );

    expect(new API(dsnPublic).getReportDialogEndpoint({})).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123',
    );
    expect(
      new API(dsnPublic).getReportDialogEndpoint({
        eventId: 'abc',
        testy: '2',
      }),
    ).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc&testy=2',
    );

    expect(
      new API(dsnPublic).getReportDialogEndpoint({
        eventId: 'abc',
        user: {
          email: 'email',
          name: 'yo',
        },
      }),
    ).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc&name=yo&email=email',
    );

    expect(
      new API(dsnPublic).getReportDialogEndpoint({
        eventId: 'abc',
        user: undefined,
      }),
    ).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc',
    );
  });
  test('getDsn', () => {
    expect(new API(dsnPublic).getDsn()).toEqual(new Dsn(dsnPublic));
  });
});
