import { TextDecoder, TextEncoder } from 'util';
import { SDK_VERSION, lazyLoadIntegration } from '../../../src';
import * as Sentry from '../../../src';
const patchedEncoder = (!global.window.TextEncoder && (global.window.TextEncoder = TextEncoder)) || true;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
const patchedDecoder = (!global.window.TextDecoder && (global.window.TextDecoder = TextDecoder)) || true;

import { JSDOM } from 'jsdom';

const globalDocument = global.document;
const globalWindow = global.window;
const globalLocation = global.location;

describe('lazyLoadIntegration', () => {
  beforeEach(() => {
    const dom = new JSDOM('<body></body>', {
      runScripts: 'dangerously',
      resources: 'usable',
    });

    global.document = dom.window.document;
    // @ts-expect-error need to override global document
    global.window = dom.window;
    global.location = dom.window.location;
    // @ts-expect-error For testing sake
    global.Sentry = undefined;
  });

  // Reset back to previous values
  afterEach(() => {
    global.document = globalDocument;
    global.window = globalWindow;
    global.location = globalLocation;
  });

  afterAll(() => {
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedEncoder && delete global.window.TextEncoder;
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedDecoder && delete global.window.TextDecoder;
  });

  test('it rejects invalid name', async () => {
    // @ts-expect-error For testing sake - otherwise this bails out anyhow
    global.Sentry = Sentry;

    // @ts-expect-error we want to test this
    await expect(() => lazyLoadIntegration('invalid!!!')).rejects.toThrow('Cannot lazy load integration: invalid!!!');
  });

  test('it rejects without global Sentry variable', async () => {
    await expect(() => lazyLoadIntegration('httpClientIntegration')).rejects.toThrow(
      'Cannot lazy load integration: httpClientIntegration',
    );
  });

  test('it does not inject a script tag if integration already exists', async () => {
    // @ts-expect-error For testing sake
    global.Sentry = Sentry;

    const integration = await lazyLoadIntegration('httpClientIntegration');

    expect(integration).toBe(Sentry.httpClientIntegration);
    expect(global.document.querySelectorAll('script')).toHaveLength(0);
  });

  test('it injects a script tag if integration is not yet loaded xxx', async () => {
    // @ts-expect-error For testing sake
    global.Sentry = {
      ...Sentry,
      httpClientIntegration: undefined,
    };

    // We do not await here, as this this does not seem to work with JSDOM :(
    // We have browser integration tests to check that this actually works
    void lazyLoadIntegration('httpClientIntegration');

    expect(global.document.querySelectorAll('script')).toHaveLength(1);
    expect(global.document.querySelector('script')?.src).toEqual(
      `https://browser.sentry-cdn.com/${SDK_VERSION}/httpclient.min.js`,
    );
  });
});
