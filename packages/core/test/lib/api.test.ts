import { Dsn } from '@sentry/utils';

import { API, getReportDialogEndpoint } from '../../src/api';

const ingestDsn = 'https://abc@xxxx.ingest.sentry.io:1234/subpath/123';
const dsnPublic = 'https://abc@sentry.io:1234/subpath/123';
const legacyDsn = 'https://abc:123@sentry.io:1234/subpath/123';
const tunnel = 'https://hello.com/world';

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
    expect(new API(dsnPublic, {}, tunnel).getEnvelopeEndpointWithUrlEncodedAuth()).toEqual(tunnel);
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
    expect(getReportDialogEndpoint(ingestDsn, {})).toEqual(
      'https://xxxx.ingest.sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@xxxx.ingest.sentry.io:1234/subpath/123',
    );

    expect(getReportDialogEndpoint(dsnPublic, {})).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123',
    );
    expect(
      getReportDialogEndpoint(dsnPublic, {
        eventId: 'abc',
        testy: '2',
      }),
    ).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc&testy=2',
    );

    expect(
      getReportDialogEndpoint(dsnPublic, {
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
      getReportDialogEndpoint(dsnPublic, {
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
