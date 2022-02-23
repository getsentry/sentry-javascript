const { get } = require('http');
const nock = require('nock');
const nodeSDK = require('@sentry/node');
const { logIf, parseEnvelope } = require('./common');

Error.stackTraceLimit = Infinity;

const getAsync = (url, rewrap = false) => {
  // Depending on what version of Nextjs we're testing, the wrapping which happens in the `Http` integration may have
  // happened too early and gotten overwritten by `nock`. This redoes the wrapping if so.
  //
  // TODO: This works but is pretty hacky in that it has the potential to wrap things multiple times, more even than the
  // double-wrapping which is discussed at length in the comment in `ensureWrappedGet` below, which is why we need
  // `rewrap`. Once we fix `fill` to not wrap things twice, we should be able to take this out and just always call
  // `ensureWrappedGet`.
  const wrappedGet = rewrap ? ensureWrappedGet(get, url) : get;

  return new Promise((resolve, reject) => {
    wrappedGet(url, res => {
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
};

const interceptEventRequest = (expectedEvent, argv, testName = '') => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/store/', body => {
      logIf(
        process.env.LOG_REQUESTS,
        '\nIntercepted Event' + (testName.length ? ` (from test \`${testName}\`)` : ''),
        body,
        argv.depth,
      );
      return objectMatches(body, expectedEvent);
    })
    .reply(200);
};

const interceptSessionRequest = (expectedItem, argv, testName = '') => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/envelope/', body => {
      const { envelopeHeader, itemHeader, item } = parseEnvelope(body);
      logIf(
        process.env.LOG_REQUESTS,
        '\nIntercepted Session' + (testName.length ? ` (from test \`${testName}\`)` : ''),
        { envelopeHeader, itemHeader, item },
        argv.depth,
      );
      return itemHeader.type === 'session' && objectMatches(item, expectedItem);
    })
    .reply(200);
};

const interceptTracingRequest = (expectedItem, argv, testName = '') => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/envelope/', body => {
      const { envelopeHeader, itemHeader, item } = parseEnvelope(body);
      logIf(
        process.env.LOG_REQUESTS,
        '\nIntercepted Transaction' + (testName.length ? ` (from test \`${testName}\`)` : ''),
        { envelopeHeader, itemHeader, item },
        argv.depth,
      );
      return itemHeader.type === 'transaction' && objectMatches(item, expectedItem);
    })
    .reply(200);
};

/**
 * Recursively checks that every path/value pair in `expected` matches that in `actual` (but not vice-versa).
 *
 * Only works for JSONifiable data.
 */
const objectMatches = (actual, expected) => {
  // each will output either '[object Object]' or '[object <ClassName>]'
  if (Object.prototype.toString.call(actual) !== Object.prototype.toString.call(expected)) {
    return false;
  }

  for (const key in expected) {
    const expectedValue = expected[key];
    const actualValue = actual[key];

    // recurse
    if (Object.prototype.toString.call(expectedValue) === '[object Object]' || Array.isArray(expectedValue)) {
      if (!objectMatches(actualValue, expectedValue)) {
        return false;
      }
    }
    // base case
    else {
      if (actualValue !== expectedValue) {
        return false;
      }
    }
  }

  return true;
};

/**
 * Rewrap `http.get` if the wrapped version has been overridden by `nock`.
 *
 * This is only relevant for Nextjs >= 12.1, which changed when `_app` is initialized, which in turn changed the order
 * in which our SDK and `nock` wrap `http.get`. See https://github.com/getsentry/sentry-javascript/pull/4619.
 *
 * TODO: We'll have to do this for `ClientRequest` also if we decide to start wrapping that.
 * TODO: Can we fix the wrapping-things-twice problem discussed in the comment below?
 */
function ensureWrappedGet(importedGet, url) {
  // we always test against the latest minor for any given Nextjs major version, so if we're testing Next 12, it's
  // definitely at least 12.1, making this check against the major version sufficient
  if (Number(process.env.NEXTJS_VERSION) < 12) {
    return importedGet;
  }

  // As of Next 12.1, creating a `NextServer` instance (which we do immediately upon starting this test runner) loads
  // `_app`, which has the effect of initializing the SDK. So, unless something's gone wrong, we should always be able
  // to find the integration
  let httpIntegration;
  try {
    httpIntegration = nodeSDK.getCurrentHub().getClient().getIntegration(nodeSDK.Integrations.Http);
  } catch (err) {
    console.warn(`Warning: Sentry SDK not set up at \`NextServer\` initialization. Request URL: ${url}`);
    return importedGet;
  }

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
  httpIntegration.setupOnce();

  // now that we've rewrapped it, grab the correct version of `get` for use in our tests
  const httpModule = require('http');
  return httpModule.get;
}

module.exports = {
  getAsync,
  interceptEventRequest,
  interceptSessionRequest,
  interceptTracingRequest,
};
