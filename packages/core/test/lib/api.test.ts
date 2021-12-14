import { Dsn } from '@sentry/utils';

import { API, getReportDialogEndpoint, getRequestHeaders } from '../../src/api';

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
    expect(getRequestHeaders(new Dsn(dsnPublic), 'a', '1.0')).toMatchObject({
      'Content-Type': 'application/json',
      'X-Sentry-Auth': expect.stringMatching(/^Sentry sentry_version=\d, sentry_client=a\/1\.0, sentry_key=abc$/),
    });

    expect(getRequestHeaders(new Dsn(legacyDsn), 'a', '1.0')).toMatchObject({
      'Content-Type': 'application/json',
      'X-Sentry-Auth': expect.stringMatching(
        /^Sentry sentry_version=\d, sentry_client=a\/1\.0, sentry_key=abc, sentry_secret=123$/,
      ),
    });
  });

  describe('getReportDialogEndpoint', () => {
    test.each([
      [
        'with Ingest DSN',
        ingestDsn,
        {},
        'https://xxxx.ingest.sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@xxxx.ingest.sentry.io:1234/subpath/123',
      ],
      [
        'with Public DSN',
        dsnPublic,
        {},
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123',
      ],
      [
        'with Public DSN and dynamic options',
        dsnPublic,
        { eventId: 'abc', testy: '2' },
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc&testy=2',
      ],
      [
        'with Public DSN, dynamic options and user name and email',
        dsnPublic,
        {
          eventId: 'abc',
          user: {
            email: 'email',
            name: 'yo',
          },
        },
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc&name=yo&email=email',
      ],
      [
        'with Public DSN and user name',
        dsnPublic,
        {
          user: {
            name: 'yo',
          },
        },
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&name=yo',
      ],
      [
        'with Public DSN and user email',
        dsnPublic,
        {
          user: {
            email: 'email',
          },
        },
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&email=email',
      ],
      [
        'with Public DSN, dynamic options and undefined user',
        dsnPublic,
        {
          eventId: 'abc',
          user: undefined,
        },
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123&eventId=abc',
      ],
      [
        'with Public DSN and undefined user',
        dsnPublic,
        { user: undefined },
        'https://sentry.io:1234/subpath/api/embed/error-page/?dsn=https://abc@sentry.io:1234/subpath/123',
      ],
    ])(
      '%s',
      (
        _: string,
        dsn: Parameters<typeof getReportDialogEndpoint>[0],
        options: Parameters<typeof getReportDialogEndpoint>[1],
        output: ReturnType<typeof getReportDialogEndpoint>,
      ) => {
        expect(getReportDialogEndpoint(dsn, options)).toBe(output);
      },
    );
  });

  test('getDsn', () => {
    expect(new API(dsnPublic).getDsn()).toEqual(new Dsn(dsnPublic));
  });
});
