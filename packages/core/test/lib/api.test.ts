import { API } from '../../src/api';
import { DSN } from '../../src/dsn';

const dsnPublic = 'https://abc@sentry.io:1234/subpath/123';
const dsnWithSecret = 'https://abc:xyz@sentry.io:1234/subpath/123';

describe('API', () => {
  test('getStoreEndpoint', () => {
    expect(new API(dsnPublic).getStoreEndpoint(true)).toEqual(
      'https://sentry.io:1234/subpath/api/123/store/?sentry_key=abc&sentry_version=7',
    );
    expect(new API(dsnWithSecret).getStoreEndpoint(true)).toEqual(
      'https://sentry.io:1234/subpath/api/123/store/?sentry_key=abc&sentry_secret=xyz&sentry_version=7',
    );
    expect(new API(dsnPublic).getStoreEndpoint()).toEqual('https://sentry.io:1234/subpath/api/123/store/');
    expect(new API(dsnWithSecret).getStoreEndpoint()).toEqual('https://sentry.io:1234/subpath/api/123/store/');
  });

  test('getRequestHeaders', () => {
    expect(new API(dsnPublic).getRequestHeaders('a', '1.0')).toMatchObject({
      'Content-Type': 'application/json',
      'X-Sentry-Auth': expect.stringMatching(
        /^Sentry sentry_version=\d, sentry_timestamp=\d+, sentry_client=a\/1\.0, sentry_key=abc$/,
      ),
    });
    expect(new API(dsnWithSecret).getRequestHeaders('a', '1.0')).toMatchObject({
      'Content-Type': 'application/json',
      'X-Sentry-Auth': expect.stringMatching(
        /^Sentry sentry_version=\d, sentry_timestamp=\d+, sentry_client=a\/1\.0, sentry_key=abc, sentry_secret=xyz$/,
      ),
    });
  });
  test('getReportDialogEndpoint', () => {
    expect(new API(dsnPublic).getReportDialogEndpoint({})).toEqual(
      'https://sentry.io:1234/subpath/api/embed/error-page/',
    );
    expect(
      new API(dsnPublic).getReportDialogEndpoint({
        eventId: 'abc',
        testy: '2',
      }),
    ).toEqual('https://sentry.io:1234/subpath/api/embed/error-page/?eventId=abc&testy=2');

    expect(
      new API(dsnPublic).getReportDialogEndpoint({
        eventId: 'abc',
        user: {
          email: 'email',
          name: 'yo',
        },
      }),
    ).toEqual('https://sentry.io:1234/subpath/api/embed/error-page/?eventId=abc&name=yo&email=email');

    expect(
      new API(dsnPublic).getReportDialogEndpoint({
        eventId: 'abc',
        user: false,
      }),
    ).toEqual('https://sentry.io:1234/subpath/api/embed/error-page/?eventId=abc');
  });
  test('getDSN', () => {
    expect(new API(dsnPublic).getDSN()).toEqual(new DSN(dsnPublic));
  });
});
