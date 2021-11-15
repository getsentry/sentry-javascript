const { strictEqual } = require('assert');
const { logIf, parseEnvelope } = require('./common');

const VALID_REQUEST_PAYLOAD = {
  status: 200,
  contentType: 'application/json',
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
};

const createRequestInterceptor = env => {
  return request => {
    if (request.url().startsWith('http://example.com')) {
      return request.respond(VALID_REQUEST_PAYLOAD);
    }

    if (!isSentryRequest(request)) {
      return request.continue();
    }

    if (isEventRequest(request)) {
      logIf(process.env.LOG_REQUESTS, 'Intercepted Event', extractEventFromRequest(request), env.argv.depth);
      env.requests.events.push(request);
    } else if (isSessionRequest(request)) {
      logIf(process.env.LOG_REQUESTS, 'Intercepted Session', extractEnvelopeFromRequest(request), env.argv.depth);
      env.requests.sessions.push(request);
    } else if (isTransactionRequest(request)) {
      logIf(process.env.LOG_REQUESTS, 'Intercepted Transaction', extractEnvelopeFromRequest(request), env.argv.depth);
      env.requests.transactions.push(request);
    }

    request.respond(VALID_REQUEST_PAYLOAD);
  };
};

const isSentryRequest = request => {
  return /sentry.io\/api/.test(request.url());
};

const isEventRequest = request => {
  return /sentry.io\/api\/\d+\/store/.test(request.url());
};

const isEnvelopeRequest = request => {
  return /sentry.io\/api\/\d+\/envelope/.test(request.url());
};

const isSessionRequest = request => {
  return isEnvelopeRequest(request) && extractEnvelopeFromRequest(request).itemHeader.type === 'session';
};

const isTransactionRequest = request => {
  return isEnvelopeRequest(request) && extractEnvelopeFromRequest(request).itemHeader.type === 'transaction';
};

const expectEvent = (request, expectedEvent) => {
  if (!request) throw new Error('Event missing');
  return assertObjectMatches(extractEventFromRequest(request), expectedEvent);
};

const expectSession = (request, expectedItem) => {
  if (!request) throw new Error('Session missing');
  const { itemHeader, item } = extractEnvelopeFromRequest(request);
  return itemHeader.type === 'session' && assertObjectMatches(item, expectedItem);
};

const expectTransaction = (request, expectedItem) => {
  if (!request) throw new Error('Transaction missing');
  const { itemHeader, item } = extractEnvelopeFromRequest(request);
  return itemHeader.type === 'transaction' && assertObjectMatches(item, expectedItem);
};

const expectRequestCount = (requests, expectedCount, timeout = 100) => {
  return new Promise((resolve, reject) => {
    // This is to provide a more human-readable stacktrace instead of truncated one from `setTimeout` call
    const err = new Error('stacktrace magic tricks');
    setTimeout(() => {
      for (const key in expectedCount) {
        try {
          strictEqual(requests[key].length, expectedCount[key]);
        } catch (e) {
          err.message = e.message;
          reject(err);
        }
      }
      resolve();
    }, timeout);
  });
};

const extractEventFromRequest = request => {
  return JSON.parse(request.postData());
};

const extractEnvelopeFromRequest = request => {
  return parseEnvelope(request.postData());
};

const assertObjectMatches = (actual, expected) => {
  if (Object.prototype.toString.call(actual) !== Object.prototype.toString.call(expected)) {
    throw new TypeError(`Types mismatch: ${actual} !== ${expected}`);
  }

  for (const key in expected) {
    const expectedValue = expected[key];

    if (Object.prototype.toString.call(expectedValue) === '[object Object]' || Array.isArray(expectedValue)) {
      assertObjectMatches(actual[key], expectedValue);
    } else {
      strictEqual(actual[key], expectedValue);
    }
  }

  return true;
};

module.exports = {
  createRequestInterceptor,
  expectEvent,
  expectRequestCount,
  expectSession,
  expectTransaction,
  extractEnvelopeFromRequest,
  extractEventFromRequest,
  isEnvelopeRequest,
  isEventRequest,
  isSentryRequest,
  isSessionRequest,
  isTransactionRequest,
};
