import { getPortPromise } from 'portfinder';
import { TestEnv } from '../../../../../node-integration-tests/utils';
import * as http from 'http';
import * as path from 'path';
import * as nodeSDK from '@sentry/node';
import { createNextServer, startServer } from '../utils/common';
import { get } from 'http';

type HttpGet = (
  options: http.RequestOptions | string | URL,
  callback?: (res: http.IncomingMessage) => void,
) => http.ClientRequest;

export class NextTestEnv extends TestEnv {
  private constructor(public readonly server: http.Server, public readonly url: string) {
    super(server, url);
  }

  public static async init(): Promise<NextTestEnv> {
    const port = await getPortPromise();
    const server = await createNextServer({
      dev: false,
      dir: path.resolve(__dirname, '../..'),
    });

    await startServer(server, port);

    return new NextTestEnv(server, `http://localhost:${port}`);
  }

  /**
   * Rewrap `http.get` if the wrapped version has been overridden by `nock`.
   *
   * This is only relevant for Nextjs >= 12.1, which changed when `_app` is initialized, which in turn changed the order
   * in which our SDK and `nock` wrap `http.get`. See https://github.com/getsentry/sentry-javascript/pull/4619.
   *
   * TODO: We'll have to do this for `ClientRequest` also if we decide to start wrapping that.
   * TODO: Can we fix the wrapping-things-twice problem discussed in the comment below?
   */
  public ensureWrappedGet(importedGet: HttpGet, url: string) {
    // we always test against the latest minor for any given Nextjs major version, so if we're testing Next 12, it's
    // definitely at least 12.1, making this check against the major version sufficient
    if (Number(process.env.NEXTJS_VERSION) < 12) {
      return importedGet;
    }

    // As of Next 12.1, creating a `NextServer` instance (which we do immediately upon starting this test runner) loads
    // `_app`, which has the effect of initializing the SDK. So, unless something's gone wrong, we should always be able
    // to find the integration
    const hub = nodeSDK.getCurrentHub();
    const client = hub.getClient();

    if (!client) {
      console.warn(`Warning: Sentry SDK not set up at \`NextServer\` initialization. Request URL: ${url}`);
      return importedGet;
    }

    const httpIntegration = client.getIntegration(nodeSDK.Integrations.Http);

    // This rewraps `http.get` and `http.request`, which, at this point, look like `nockWrapper(sentryWrapper(get))` and
    // `nockWrapper(sentryWrapper(request))`. By the time we're done with this function, they'll look like
    // `sentryWrapper(nockWrapper(sentryWrapper(get)))` and `sentryWrapper(nockWrapper(sentryWrapper(request)))`,
    // respectively. Though this seems less than ideal, we don't have to worry about our instrumentation being
    // (meaningfully) called twice because:
    //
    // 1) As long as we set up a `nock` interceptor for any outgoing http request, `nock`'s wrapper will call a replacement
    //    function for that request rather than call the function it's wrapping (in other words, it will look more like
    //    `sentryWrapper(nockWrapper(getSubstitute))` than `sentryWrapper(nockWrapper(sentryWrapper(get)))`), which means
    //    our code is only called once.
    // 2) In cases where we don't set up an interceptor (such as for the `wrappedGet` call in `getAsync` above), it's true
    //    that we can end up with `sentryWrapper(nockWrapper(sentryWrapper(get)))`, meaning our wrapper code will run
    //    twice. For now that's okay because in those cases we're not in the middle of a transactoin and therefore
    //    the two wrappers' respective attempts to start spans will both no-op.
    //
    // TL; DR - if the double-wrapping means you're seeing two spans where you really only want one, set up a nock
    // interceptor for the request.
    //
    // TODO: add in a "don't do this twice" check (in `fill`, maybe moved from `wrap`), so that we don't wrap the outer
    // wrapper with a third wrapper
    if (httpIntegration) {
      httpIntegration.setupOnce(
        () => undefined,
        () => hub,
      );
    }

    // now that we've rewrapped it, grab the correct version of `get` for use in our tests
    const httpModule = require('http');
    return httpModule.get;
  }

  public async getAsync(url: string, rewrap = false) {
    // Depending on what version of Nextjs we're testing, the wrapping which happens in the `Http` integration may have
    // happened too early and gotten overwritten by `nock`. This redoes the wrapping if so.
    //
    // TODO: This works but is pretty hacky in that it has the potential to wrap things multiple times, more even than the
    // double-wrapping which is discussed at length in the comment in `ensureWrappedGet` below, which is why we need
    // `rewrap`. Once we fix `fill` to not wrap things twice, we should be able to take this out and just always call
    // `ensureWrappedGet`.
    const wrappedGet = rewrap ? this.ensureWrappedGet(get, url) : get;

    return new Promise((resolve, reject) => {
      wrappedGet(url, (res: http.IncomingMessage) => {
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            resolve(rawData);
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  }
}
