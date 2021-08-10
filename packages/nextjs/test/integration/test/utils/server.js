const { get } = require('http');
const nock = require('nock');
const { logIf, parseEnvelope } = require('./common');

const getAsync = url => {
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

const interceptEventRequest = (expectedEvent, argv, testName = '') => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/store/', body => {
      logIf(
        argv.debug,
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
        argv.debug,
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
        argv.debug,
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

module.exports = {
  getAsync,
  interceptEventRequest,
  interceptSessionRequest,
  interceptTracingRequest,
};
