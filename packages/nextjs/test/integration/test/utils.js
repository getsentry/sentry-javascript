const { strictEqual } = require('assert');
const { get } = require('http');
const { inspect } = require('util');

const nock = require('nock');

const logIf = (module.exports.logIf = (condition, message, input, depth = 4) => {
  if (condition) {
    console.log(message);
    if (input) {
      console.log(inspect(input, { depth }));
    }
  }
});

// Server

module.exports.getAsync = url => {
  return new Promise((resolve, reject) => {
    get(url, res => {
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

module.exports.interceptEventRequest = (expectedEvent, argv = {}) => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/store/', body => {
      logIf(argv.debug, 'Intercepted Event', body, argv.depth);
      return objectMatches(body, expectedEvent);
    })
    .reply(200);
};

module.exports.interceptSessionRequest = (expectedItem, argv = {}) => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/envelope/', body => {
      const { envelopeHeader, itemHeader, item } = parseEnvelope(body);
      logIf(argv.debug, 'Intercepted Transaction', { envelopeHeader, itemHeader, item }, argv.depth);
      return itemHeader.type === 'session' && objectMatches(item, expectedItem);
    })
    .reply(200);
};

module.exports.interceptTracingRequest = (expectedItem, argv = {}) => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/envelope/', body => {
      const { envelopeHeader, itemHeader, item } = parseEnvelope(body);
      logIf(argv.debug, 'Intercepted Transaction', { envelopeHeader, itemHeader, item }, argv.depth);
      return itemHeader.type === 'transaction' && objectMatches(item, expectedItem);
    })
    .reply(200);
};

const objectMatches = (actual, expected) => {
  if (Object.prototype.toString.call(actual) !== Object.prototype.toString.call(expected)) {
    return false;
  }

  for (const key in expected) {
    const expectedValue = expected[key];

    if (Object.prototype.toString.call(expectedValue) === '[object Object]' || Array.isArray(expectedValue)) {
      if (!objectMatches(actual[key], expectedValue)) {
        return false;
      }
    } else {
      if (actual[key] !== expectedValue) {
        return false;
      }
    }
  }

  return true;
};

// Client

module.exports.isSentryRequest = request => {
  return /sentry.io\/api/.test(request.url());
};

module.exports.isEventRequest = request => {
  return /sentry.io\/api\/\d+\/store/.test(request.url());
};

const isEnvelopeRequest = request => {
  return /sentry.io\/api\/\d+\/envelope/.test(request.url());
};

module.exports.isSessionRequest = request => {
  return isEnvelopeRequest(request) && extractEnvelopeFromRequest(request).itemHeader.type === 'session';
};

module.exports.isTransactionRequest = request => {
  return isEnvelopeRequest(request) && extractEnvelopeFromRequest(request).itemHeader.type === 'transaction';
};

module.exports.waitForAll = actions => {
  return Promise.all(actions).catch(() => {
    throw new Error('Failed to await on all requested actions');
  });
};

module.exports.sleep = duration => {
  return new Promise(resolve => setTimeout(() => resolve(), duration));
};

module.exports.expectEvent = (request, expectedEvent) => {
  if (!request) throw new Error('Event missing');
  return assertObjectMatches(extractEventFromRequest(request), expectedEvent);
};

module.exports.expectSession = (request, expectedItem) => {
  if (!request) throw new Error('Session missing');
  const { itemHeader, item } = extractEnvelopeFromRequest(request);
  return itemHeader.type === 'session' && assertObjectMatches(item, expectedItem);
};

module.exports.expectTransaction = (request, expectedItem) => {
  if (!request) throw new Error('Transaction missing');
  const { itemHeader, item } = extractEnvelopeFromRequest(request);
  return itemHeader.type === 'transaction' && assertObjectMatches(item, expectedItem);
};

module.exports.expectRequestCount = (requests, expectedCount, timeout = 100) => {
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

const extractEventFromRequest = (module.exports.extractEventFromRequest = request => {
  return JSON.parse(request.postData());
});

const extractEnvelopeFromRequest = (module.exports.extractEnvelopeFromRequest = request => {
  return parseEnvelope(request.postData());
});

const parseEnvelope = body => {
  const [envelopeHeaderString, itemHeaderString, itemString] = body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    item: JSON.parse(itemString),
  };
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

// Misc

const COLOR_RESET = '\x1b[0m';
const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
};

module.exports.colorize = (str, color) => {
  if (!(color in COLORS)) {
    throw new Error(`Unknown color. Available colors: ${Object.keys(COLORS).join(', ')}`);
  }

  return `${COLORS[color]}${str}${COLOR_RESET}`;
};
